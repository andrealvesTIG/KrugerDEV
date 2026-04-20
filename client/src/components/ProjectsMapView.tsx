import { useMemo, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Project } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, AlertCircle, ExternalLink, Image as ImageIcon } from "lucide-react";
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

interface ProjectWithLocation extends Project {
  latitude?: string | number | null;
  longitude?: string | number | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  addressLine1?: string | null;
  images?: Array<{ url: string; alt?: string }> | null;
}

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
  useEffect(() => {
    if (markers.length === 0) return;
    if (markers.length === 1) {
      map.setView(markers[0], 10);
      return;
    }
    const bounds = L.latLngBounds(markers.map(([lat, lng]) => L.latLng(lat, lng)));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
  }, [markers, map]);
  return null;
}

export function ProjectsMapView({ projects, portfolios }: Props) {
  const projectsWithCoords = useMemo(() => {
    return projects
      .map(p => ({
        ...p,
        _lat: p.latitude != null && p.latitude !== "" ? Number(p.latitude) : NaN,
        _lng: p.longitude != null && p.longitude !== "" ? Number(p.longitude) : NaN,
      }))
      .filter(p => !isNaN(p._lat) && !isNaN(p._lng));
  }, [projects]);

  const missingCount = projects.length - projectsWithCoords.length;
  const markers = projectsWithCoords.map(p => [p._lat, p._lng] as [number, number]);
  const center: [number, number] = markers[0] || [20, 0];
  const portfolioName = (id: number | null | undefined) =>
    portfolios?.find(pf => pf.id === id)?.name;

  return (
    <div className="space-y-3" data-testid="view-map">
      {missingCount > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 flex-shrink-0" />
          <div>
            <span className="font-medium">{missingCount} project{missingCount === 1 ? "" : "s"}</span>{" "}
            {missingCount === 1 ? "is" : "are"} not shown because{" "}
            {missingCount === 1 ? "it has" : "they have"} no coordinates. Open a project and use the
            Location & Media section to add an address and auto-locate.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
        <Card className="overflow-hidden">
          <div style={{ height: "calc(100vh - 320px)", minHeight: 480 }}>
            {projectsWithCoords.length === 0 ? (
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
                {projectsWithCoords.map(p => {
                  const cover = p.images?.[0]?.url;
                  return (
                    <Marker key={p.id} position={[p._lat, p._lng]}>
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
              <MapPin className="h-4 w-4" /> {projectsWithCoords.length} on map
            </div>
            <div className="space-y-2 max-h-[calc(100vh-360px)] overflow-y-auto pr-1">
              {projectsWithCoords.map(p => {
                const cover = p.images?.[0]?.url;
                return (
                  <Link key={p.id} href={`/projects/${p.id}`}>
                    <div
                      className="flex gap-2 p-2 rounded-md border hover:bg-accent cursor-pointer transition-colors"
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
                    </div>
                  </Link>
                );
              })}
              {projectsWithCoords.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No projects with coordinates.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
