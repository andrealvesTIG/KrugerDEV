import { useMemo, useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import type { Project } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, AlertCircle, ExternalLink, Image as ImageIcon, List } from "lucide-react";
import { Link } from "wouter";

const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = defaultIcon;

type ProjectWithLocation = Project;

interface Props {
  projects: ProjectWithLocation[];
  portfolios?: Array<{ id: number; name: string }>;
}

const STATUS_COLORS: Record<string, string> = {
  Initiation: "bg-blue-500",
  Planning: "bg-indigo-500",
  Execution: "bg-emerald-500",
  Monitoring: "bg-amber-500",
  Closing: "bg-purple-500",
  Billing: "bg-pink-500",
  "On Hold": "bg-amber-600",
  Closed: "bg-slate-500",
};

const STATUS_HEX: Record<string, string> = {
  Initiation: "#3b82f6",
  Planning: "#6366f1",
  Execution: "#10b981",
  Monitoring: "#f59e0b",
  Closing: "#a855f7",
  Billing: "#ec4899",
  "On Hold": "#d97706",
  Closed: "#64748b",
};

const STATUS_FALLBACK_HEX = "#94a3b8";

const STATUS_FILTER_PARAM = "mapStatus";
const STATUS_FILTER_STORAGE_KEY = "projectsMap.selectedStatuses";

function readInitialStatuses(): Set<string> {
  if (typeof window === "undefined") return new Set();
  const validStatuses = new Set(Object.keys(STATUS_HEX));
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get(STATUS_FILTER_PARAM);
    if (fromUrl !== null) {
      const parsed = fromUrl
        .split(",")
        .map((s) => s.trim())
        .filter((s) => validStatuses.has(s));
      return new Set(parsed);
    }
  } catch {
    // ignore malformed URL params
  }
  try {
    const stored = window.localStorage.getItem(STATUS_FILTER_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return new Set(parsed.filter((s): s is string => typeof s === "string" && validStatuses.has(s)));
      }
    }
  } catch {
    // ignore storage/JSON errors
  }
  return new Set();
}

// Tie-breaker order: when multiple statuses tie for "dominant", the one with
// higher severity wins so users see the worst-case health at a glance.
const STATUS_SEVERITY: Record<string, number> = {
  "On Hold": 100,
  Monitoring: 80,
  Initiation: 60,
  Planning: 50,
  Execution: 40,
  Billing: 30,
  Closing: 20,
  Closed: 10,
};

function statusHex(status: string | null | undefined): string {
  return (status && STATUS_HEX[status]) || STATUS_FALLBACK_HEX;
}

function dominantStatus(statuses: Array<string | null | undefined>): string {
  const counts = new Map<string, number>();
  for (const s of statuses) {
    const key = s || "";
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = "";
  let bestCount = -1;
  let bestSeverity = -1;
  for (const [status, count] of counts) {
    const severity = STATUS_SEVERITY[status] ?? 0;
    if (
      count > bestCount ||
      (count === bestCount && severity > bestSeverity)
    ) {
      best = status;
      bestCount = count;
      bestSeverity = severity;
    }
  }
  return best;
}

function makeMarkerIcon(status: string | null | undefined, coverUrl?: string | null): L.DivIcon {
  const color = statusHex(status);
  if (coverUrl) {
    // Circular thumbnail with status-colored ring + small drop tail.
    const safeUrl = String(coverUrl).replace(/"/g, "&quot;");
    const html = `
      <div style="position:relative;width:44px;height:54px;">
        <div style="
          position:absolute;left:50%;top:0;transform:translateX(-50%);
          width:40px;height:40px;border-radius:50%;
          background:${color};
          padding:3px;
          box-shadow:0 2px 5px rgba(0,0,0,0.35);
          box-sizing:border-box;
        ">
          <div style="
            width:100%;height:100%;border-radius:50%;
            background-image:url('${safeUrl}');
            background-size:cover;background-position:center;
            border:2px solid #ffffff;
            box-sizing:border-box;
          "></div>
        </div>
        <div style="
          position:absolute;left:50%;top:38px;transform:translateX(-50%);
          width:0;height:0;
          border-left:7px solid transparent;
          border-right:7px solid transparent;
          border-top:14px solid ${color};
          filter:drop-shadow(0 1px 1px rgba(0,0,0,0.3));
        "></div>
      </div>`;
    return L.divIcon({
      html,
      className: "project-status-marker project-status-marker--photo",
      iconSize: [44, 54],
      iconAnchor: [22, 52],
      popupAnchor: [0, -50],
    });
  }
  const html = `
    <div style="position:relative;width:24px;height:32px;">
      <div style="
        position:absolute;left:50%;top:0;transform:translateX(-50%);
        width:22px;height:22px;border-radius:50%;
        background:${color};
        border:2px solid #ffffff;
        box-shadow:0 1px 3px rgba(0,0,0,0.4);
      "></div>
      <div style="
        position:absolute;left:50%;top:18px;transform:translateX(-50%);
        width:0;height:0;
        border-left:6px solid transparent;
        border-right:6px solid transparent;
        border-top:12px solid ${color};
        filter:drop-shadow(0 1px 1px rgba(0,0,0,0.3));
      "></div>
    </div>`;
  return L.divIcon({
    html,
    className: "project-status-marker",
    iconSize: [24, 32],
    iconAnchor: [12, 30],
    popupAnchor: [0, -28],
  });
}

function makeClusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const children = cluster.getAllChildMarkers();
  const statuses = children.map((m) => (m.options as L.MarkerOptions & { projectStatus?: string }).projectStatus);
  const dominant = dominantStatus(statuses);
  const color = statusHex(dominant);
  const count = cluster.getChildCount();
  const size = count < 10 ? 36 : count < 100 ? 42 : 50;
  const html = `
    <div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};color:#ffffff;
      display:flex;align-items:center;justify-content:center;
      font-weight:600;font-size:${count < 100 ? 13 : 12}px;
      border:3px solid rgba(255,255,255,0.9);
      box-shadow:0 2px 6px rgba(0,0,0,0.35);
    ">${count}</div>`;
  return L.divIcon({
    html,
    className: "project-status-cluster",
    iconSize: [size, size],
  });
}

function FitBounds({ signature, markers }: { signature: string; markers: Array<[number, number]> }) {
  const map = useMap();
  const lastSig = useRef<string>("");
  useEffect(() => {
    if (markers.length === 0) return;
    if (lastSig.current === signature) return;
    lastSig.current = signature;
    if (markers.length === 1) {
      map.setView(markers[0], 10);
    } else {
      const bounds = L.latLngBounds(markers.map(([lat, lng]) => L.latLng(lat, lng)));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
  }, [signature, markers, map]);
  return null;
}

function ViewportTracker({ onChange }: { onChange: (bounds: L.LatLngBounds) => void }) {
  const map = useMap();
  const lastKeyRef = useRef<string>("");
  const emit = (b: L.LatLngBounds) => {
    const key = `${b.getSouth().toFixed(5)},${b.getWest().toFixed(5)},${b.getNorth().toFixed(5)},${b.getEast().toFixed(5)}`;
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    onChange(b);
  };
  useEffect(() => {
    emit(map.getBounds());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  useMapEvents({
    moveend: () => emit(map.getBounds()),
    zoomend: () => emit(map.getBounds()),
  });
  return null;
}

type MapController = {
  flyTo: (lat: number, lng: number, id: number) => void;
};

function MapControllerBridge({ onReady }: { onReady: (ctrl: MapController) => void }) {
  const map = useMap();
  useEffect(() => {
    onReady({
      flyTo: (lat, lng) => {
        map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { duration: 0.8 });
      },
    });
  }, [map, onReady]);
  return null;
}

export function ProjectsMapView({ projects, portfolios }: Props) {
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(() => readInitialStatuses());
  const [selectedPortfolios, setSelectedPortfolios] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (selectedStatuses.size === 0) {
        params.delete(STATUS_FILTER_PARAM);
        window.localStorage.removeItem(STATUS_FILTER_STORAGE_KEY);
      } else {
        const values = Array.from(selectedStatuses).sort();
        params.set(STATUS_FILTER_PARAM, values.join(","));
        window.localStorage.setItem(STATUS_FILTER_STORAGE_KEY, JSON.stringify(values));
      }
      const query = params.toString();
      const newUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", newUrl);
    } catch {
      // ignore failures updating URL/storage
    }
  }, [selectedStatuses]);
  const controllerRef = useRef<MapController | null>(null);
  const markerRefs = useRef<Record<number, L.Marker | null>>({});
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);

  const { withCoords, missing } = useMemo(() => {
    const withCoords: Array<ProjectWithLocation & { _lat: number; _lng: number }> = [];
    const missing: ProjectWithLocation[] = [];
    for (const p of projects) {
      const lat = p.latitude != null && p.latitude !== "" ? Number(p.latitude) : NaN;
      const lng = p.longitude != null && p.longitude !== "" ? Number(p.longitude) : NaN;
      if (!isNaN(lat) && !isNaN(lng)) {
        withCoords.push({ ...p, _lat: lat, _lng: lng });
      } else {
        missing.push(p);
      }
    }
    return { withCoords, missing };
  }, [projects]);

  const filteredCoords = useMemo(() => {
    if (selectedStatuses.size === 0 && selectedPortfolios.size === 0) return withCoords;
    return withCoords.filter(p => {
      const statusOk = selectedStatuses.size === 0 || selectedStatuses.has(p.status || "");
      const portfolioOk =
        selectedPortfolios.size === 0 ||
        (p.portfolioId != null && selectedPortfolios.has(p.portfolioId));
      return statusOk && portfolioOk;
    });
  }, [withCoords, selectedStatuses, selectedPortfolios]);

  const visibleProjects = useMemo(() => {
    if (!bounds) return filteredCoords;
    return filteredCoords.filter(p => bounds.contains([p._lat, p._lng]));
  }, [filteredCoords, bounds]);

  const markerIcons = useMemo(() => {
    const map = new Map<number, L.DivIcon>();
    for (const p of filteredCoords) {
      const cover = p.images?.[0]?.url;
      map.set(p.id, makeMarkerIcon(p.status, cover));
    }
    return map;
  }, [filteredCoords]);

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const togglePortfolio = (id: number) => {
    setSelectedPortfolios(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearStatusFilter = () => setSelectedStatuses(new Set());
  const clearPortfolioFilter = () => setSelectedPortfolios(new Set());
  const clearAllFilters = () => {
    setSelectedStatuses(new Set());
    setSelectedPortfolios(new Set());
  };
  const isStatusFiltering = selectedStatuses.size > 0;
  const isPortfolioFiltering = selectedPortfolios.size > 0;
  const isFiltering = isStatusFiltering || isPortfolioFiltering;

  const markers = withCoords.map(p => [p._lat, p._lng] as [number, number]);
  const markersSignature = withCoords.map(p => `${p.id}:${p._lat.toFixed(4)},${p._lng.toFixed(4)}`).join("|");
  const center: [number, number] = markers[0] || [20, 0];
  const portfolioName = (id: number | null | undefined) =>
    portfolios?.find(pf => pf.id === id)?.name;

  const handleListItemClick = (p: ProjectWithLocation & { _lat: number; _lng: number }) => {
    setSelectedId(p.id);
    const mk = markerRefs.current[p.id];
    const cluster = clusterGroupRef.current;
    if (cluster && mk) {
      cluster.zoomToShowLayer(mk, () => {
        mk.openPopup();
      });
      return;
    }
    controllerRef.current?.flyTo(p._lat, p._lng, p.id);
    if (mk) setTimeout(() => mk.openPopup(), 400);
  };

  return (
    <div className="space-y-3" data-testid="view-map">
      {missing.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <span className="font-medium">{missing.length} project{missing.length === 1 ? "" : "s"}</span>{" "}
            {missing.length === 1 ? "is" : "are"} not shown because{" "}
            {missing.length === 1 ? "it has" : "they have"} no coordinates.
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setShowMissingOnly(v => !v)}
            data-testid="button-toggle-missing"
          >
            <List className="h-3 w-3 mr-1" />
            {showMissingOnly ? "Hide list" : `Show ${missing.length} hidden`}
          </Button>
        </div>
      )}

      {showMissingOnly && missing.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="text-xs font-semibold mb-2 text-muted-foreground">Projects without coordinates — open one to add an address</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {missing.map(p => (
                <Link key={p.id} href={`/projects/${p.id}`}>
                  <div
                    className="flex items-center justify-between gap-2 p-2 rounded-md border hover:bg-accent cursor-pointer transition-colors"
                    data-testid={`missing-item-${p.id}`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {[p.city, p.region, p.country].filter(Boolean).join(", ") || "No address set"}
                      </div>
                    </div>
                    <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
        <Card className="overflow-hidden">
          <div style={{ height: "calc(100vh - 320px)", minHeight: 480 }}>
            {withCoords.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
                <MapPin className="h-12 w-12 mb-3 opacity-50" />
                <p className="text-base font-medium">No projects to display on the map</p>
                <p className="text-sm mt-1">Add coordinates to your projects to see them here.</p>
              </div>
            ) : (
              <MapContainer
                center={center}
                zoom={3}
                scrollWheelZoom
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                  url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                  subdomains={["a", "b", "c", "d"]}
                  maxZoom={19}
                />
                <FitBounds signature={markersSignature} markers={markers} />
                <ViewportTracker onChange={setBounds} />
                <MapControllerBridge onReady={(c) => { controllerRef.current = c; }} />
                <MarkerClusterGroup
                  ref={(ref: L.MarkerClusterGroup | null) => { clusterGroupRef.current = ref; }}
                  chunkedLoading
                  showCoverageOnHover={false}
                  spiderfyOnMaxZoom
                  zoomToBoundsOnClick
                  maxClusterRadius={50}
                  iconCreateFunction={makeClusterIcon}
                >
                {filteredCoords.map(p => {
                  const cover = p.images?.[0]?.url;
                  return (
                    <Marker
                      key={p.id}
                      position={[p._lat, p._lng]}
                      icon={markerIcons.get(p.id)!}
                      ref={(ref) => {
                        markerRefs.current[p.id] = ref;
                        if (ref) {
                          (ref.options as L.MarkerOptions & { projectStatus?: string }).projectStatus = p.status || "";
                        }
                      }}
                      eventHandlers={{
                        click: () => setSelectedId(p.id),
                        mouseover: (e) => {
                          const m = e.target as L.Marker & { _hoverCloseTimer?: ReturnType<typeof setTimeout> };
                          if (m._hoverCloseTimer) {
                            clearTimeout(m._hoverCloseTimer);
                            m._hoverCloseTimer = undefined;
                          }
                          m.openPopup();
                        },
                        mouseout: (e) => {
                          const m = e.target as L.Marker & { _hoverCloseTimer?: ReturnType<typeof setTimeout> };
                          m._hoverCloseTimer = setTimeout(() => m.closePopup(), 200);
                        },
                        popupopen: (e) => {
                          const m = e.target as L.Marker & { _hoverCloseTimer?: ReturnType<typeof setTimeout> };
                          const el = e.popup.getElement();
                          if (!el) return;
                          const onEnter = () => {
                            if (m._hoverCloseTimer) {
                              clearTimeout(m._hoverCloseTimer);
                              m._hoverCloseTimer = undefined;
                            }
                          };
                          const onLeave = () => {
                            m._hoverCloseTimer = setTimeout(() => m.closePopup(), 200);
                          };
                          el.addEventListener("mouseenter", onEnter);
                          el.addEventListener("mouseleave", onLeave);
                        },
                      }}
                    >
                      <Popup minWidth={220} maxWidth={280} autoPan={false} keepInView={false}>
                        <div className="space-y-2" data-testid={`popup-project-${p.id}`}>
                          {cover && (
                            <img
                              src={cover}
                              alt={p.name}
                              className="w-full h-28 object-cover rounded"
                            />
                          )}
                          <div className="font-semibold text-sm">{p.name}</div>
                          <div className="flex flex-wrap items-center gap-1 text-xs">
                            <Badge variant="secondary" className="text-[10px]">
                              <span className={`inline-block h-1.5 w-1.5 rounded-full mr-1 ${STATUS_COLORS[p.status || ""] || "bg-slate-400"}`} />
                              {p.status}
                            </Badge>
                            {portfolioName(p.portfolioId) && (
                              <Badge variant="outline" className="text-[10px]">{portfolioName(p.portfolioId)}</Badge>
                            )}
                          </div>
                          {(p.addressLine1 || p.city) && (
                            <div className="text-xs text-muted-foreground">
                              {[p.addressLine1, p.city, p.region, p.country].filter(Boolean).join(", ")}
                            </div>
                          )}
                          <Link href={`/projects/${p.id}`}>
                            <Button size="sm" variant="outline" className="w-full h-7 text-xs">
                              <ExternalLink className="h-3 w-3 mr-1" /> Open project
                            </Button>
                          </Link>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
                </MarkerClusterGroup>
              </MapContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="text-sm font-semibold mb-2 flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4" /> {visibleProjects.length} visible
                {visibleProjects.length !== filteredCoords.length && (
                  <span className="text-xs font-normal text-muted-foreground">
                    of {filteredCoords.length}
                  </span>
                )}
              </span>
              {isFiltering && (
                <span className="text-[10px] font-normal text-muted-foreground" data-testid="text-filter-summary">
                  (filtered from {withCoords.length})
                </span>
              )}
              {isFiltering && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="ml-auto text-[10px] text-primary hover:underline"
                  data-testid="button-clear-all-filters"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="mb-3 pb-3 border-b" data-testid="map-status-legend">
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Filter by status
                </div>
                {isStatusFiltering && (
                  <button
                    type="button"
                    onClick={clearStatusFilter}
                    className="text-[10px] text-primary hover:underline"
                    data-testid="button-clear-status-filter"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                {Object.keys(STATUS_HEX).map((status) => {
                  const active = !isStatusFiltering || selectedStatuses.has(status);
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => toggleStatus(status)}
                      aria-pressed={isStatusFiltering && selectedStatuses.has(status)}
                      className={`flex items-center gap-1.5 text-[11px] px-1.5 py-0.5 rounded hover:bg-accent text-left transition-opacity ${active ? "opacity-100" : "opacity-40"}`}
                      data-testid={`legend-${status.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full border border-white shadow-sm flex-shrink-0"
                        style={{ background: STATUS_HEX[status] }}
                      />
                      <span className="truncate">{status}</span>
                    </button>
                  );
                })}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
                {isFiltering
                  ? `Showing ${filteredCoords.length} of ${withCoords.length} projects. Click a status to toggle.`
                  : "Click a status to filter the map. Cluster bubbles show the dominant status (worst-case wins on ties)."}
              </div>
            </div>
            {portfolios && portfolios.length > 0 && (
              <div className="mb-3 pb-3 border-b" data-testid="map-portfolio-filter">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Filter by portfolio
                  </div>
                  {isPortfolioFiltering && (
                    <button
                      type="button"
                      onClick={clearPortfolioFilter}
                      className="text-[10px] text-primary hover:underline"
                      data-testid="button-clear-portfolio-filter"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {portfolios.map((pf) => {
                    const selected = selectedPortfolios.has(pf.id);
                    const active = !isPortfolioFiltering || selected;
                    return (
                      <button
                        key={pf.id}
                        type="button"
                        onClick={() => togglePortfolio(pf.id)}
                        aria-pressed={selected}
                        className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                          selected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background hover:bg-accent"
                        } ${active ? "opacity-100" : "opacity-40"}`}
                        data-testid={`portfolio-chip-${pf.id}`}
                      >
                        {pf.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="space-y-2 max-h-[calc(100vh-360px)] overflow-y-auto pr-1">
              {visibleProjects.map(p => {
                const cover = p.images?.[0]?.url;
                const isSelected = selectedId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleListItemClick(p)}
                    className={`w-full text-left flex gap-2 p-2 rounded-md border hover:bg-accent transition-colors ${isSelected ? "bg-accent border-primary" : ""}`}
                    data-testid={`map-list-item-${p.id}`}
                  >
                    <div className="w-14 h-14 rounded bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {cover ? (
                        <img src={cover} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[p.city, p.region, p.country].filter(Boolean).join(", ") || "—"}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_COLORS[p.status || ""] || "bg-slate-400"}`} />
                        <span className="text-[10px] text-muted-foreground">{p.status}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
              {visibleProjects.length === 0 && withCoords.length > 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">
                  {isFiltering
                    ? "No projects match the selected filters in the current view."
                    : "No projects in the current view. Zoom or pan the map to see more."}
                </p>
              )}
              {withCoords.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No projects with coordinates.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
