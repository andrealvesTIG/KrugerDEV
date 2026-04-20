import { useMemo, useEffect, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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

function FitBounds({ markers }: { markers: Array<[number, number]> }) {
  const map = useMap();
  const didFit = useRef(false);
  useEffect(() => {
    if (markers.length === 0 || didFit.current) return;
    if (markers.length === 1) {
      map.setView(markers[0], 10);
    } else {
      const bounds = L.latLngBounds(markers.map(([lat, lng]) => L.latLng(lat, lng)));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
    }
    didFit.current = true;
  }, [markers, map]);
  return null;
}

function ViewportTracker({ onChange }: { onChange: (bounds: L.LatLngBounds) => void }) {
  const map = useMap();
  useEffect(() => {
    onChange(map.getBounds());
  }, [map, onChange]);
  useMapEvents({
    moveend: () => onChange(map.getBounds()),
    zoomend: () => onChange(map.getBounds()),
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
  const controllerRef = useRef<MapController | null>(null);
  const markerRefs = useRef<Record<number, L.Marker | null>>({});

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

  const visibleProjects = useMemo(() => {
    if (!bounds) return withCoords;
    return withCoords.filter(p => bounds.contains([p._lat, p._lng]));
  }, [withCoords, bounds]);

  const markers = withCoords.map(p => [p._lat, p._lng] as [number, number]);
  const center: [number, number] = markers[0] || [20, 0];
  const portfolioName = (id: number | null | undefined) =>
    portfolios?.find(pf => pf.id === id)?.name;

  const handleListItemClick = (p: ProjectWithLocation & { _lat: number; _lng: number }) => {
    setSelectedId(p.id);
    controllerRef.current?.flyTo(p._lat, p._lng, p.id);
    const mk = markerRefs.current[p.id];
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
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitBounds markers={markers} />
                <ViewportTracker onChange={setBounds} />
                <MapControllerBridge onReady={(c) => { controllerRef.current = c; }} />
                {withCoords.map(p => {
                  const cover = p.images?.[0]?.url;
                  return (
                    <Marker
                      key={p.id}
                      position={[p._lat, p._lng]}
                      ref={(ref) => { markerRefs.current[p.id] = ref; }}
                      eventHandlers={{ click: () => setSelectedId(p.id) }}
                    >
                      <Popup minWidth={220} maxWidth={280}>
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
              </MapContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="text-sm font-semibold mb-2 flex items-center gap-2">
              <MapPin className="h-4 w-4" /> {visibleProjects.length} visible
              {visibleProjects.length !== withCoords.length && (
                <span className="text-xs font-normal text-muted-foreground">
                  of {withCoords.length}
                </span>
              )}
            </div>
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
                <p className="text-xs text-muted-foreground text-center py-6">No projects in the current view. Zoom or pan the map to see more.</p>
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
