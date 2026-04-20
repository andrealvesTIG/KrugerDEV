import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Loader2, MapPin, Upload, X, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

function RecenterMap({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: true });
  }, [lat, lng, map]);
  return null;
}

interface AddressSuggestion {
  displayName: string;
  latitude: number;
  longitude: number;
  addressLine1: string;
  city: string;
  region: string;
  country: string;
  postalCode: string;
}

export interface ProjectImage {
  url: string;
  alt?: string;
}

export interface ProjectLocationPatch {
  addressLine1?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  postalCode?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  images?: ProjectImage[];
}

interface Props {
  addressLine1?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  postalCode?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  images?: ProjectImage[] | null;
  projectId?: number | null;
  maxImages?: number;
  disabled?: boolean;
  onChange: (patch: ProjectLocationPatch) => void;
}

export function ProjectLocationMediaSection({
  addressLine1,
  city,
  region,
  country,
  postalCode,
  latitude,
  longitude,
  images: imagesProp,
  projectId,
  maxImages = 10,
  disabled = false,
  onChange,
}: Props) {
  const { toast } = useToast();
  const [geocoding, setGeocoding] = useState(false);
  const images = imagesProp || [];

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  // Local mirror of the address field so typing is instant — the parent
  // persists via a server mutation that re-renders the prop, which would
  // otherwise clobber in-flight keystrokes. We push the local value up on
  // blur and on suggestion select.
  const [addressInput, setAddressInput] = useState<string>(addressLine1 || "");
  const addressInputRef = useRef(addressInput);
  useEffect(() => { addressInputRef.current = addressInput; }, [addressInput]);
  // Re-sync from props only when the upstream value differs from what we last
  // pushed (e.g. another tab edited the project, or after a suggestion apply).
  useEffect(() => {
    const incoming = addressLine1 || "";
    if (incoming !== addressInputRef.current) setAddressInput(incoming);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressLine1]);

  // Debounced fetch of address suggestions (3+ chars).
  useEffect(() => {
    if (disabled) return;
    const q = addressInput.trim();
    if (q.length < 3) {
      setSuggestions([]);
      setSuggestLoading(false);
      return;
    }
    let cancelled = false;
    setSuggestLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode/suggest?q=${encodeURIComponent(q)}`, { credentials: "include" });
        if (!res.ok) throw new Error(`Suggest failed (${res.status})`);
        const data = await res.json();
        if (!cancelled) {
          setSuggestions(Array.isArray(data?.results) ? data.results : []);
          setHighlight(-1);
        }
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSuggestLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [addressInput, disabled]);

  // Close popover when clicking outside.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setSuggestOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const applySuggestion = (s: AddressSuggestion) => {
    const newAddress = s.displayName || s.addressLine1 || "";
    setAddressInput(newAddress);
    const patch: ProjectLocationPatch = { addressLine1: newAddress };
    if (s.city) patch.city = s.city;
    if (s.region) patch.region = s.region;
    if (s.country) patch.country = s.country;
    if (s.postalCode) patch.postalCode = s.postalCode;
    if (Number.isFinite(s.latitude)) patch.latitude = String(s.latitude);
    if (Number.isFinite(s.longitude)) patch.longitude = String(s.longitude);
    onChange(patch);
    setSuggestOpen(false);
    setSuggestions([]);
  };

  const onAddressKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestOpen || suggestions.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, suggestions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && highlight >= 0) { e.preventDefault(); applySuggestion(suggestions[highlight]); }
    else if (e.key === "Escape") { setSuggestOpen(false); }
  };

  const addressString = [addressLine1, city, region, postalCode, country].filter(Boolean).join(", ");

  const handleGeocode = async () => {
    const q = (addressInput || addressString).trim();
    if (q.length < 3) {
      toast({ title: "Address required", description: "Type at least 3 characters first.", variant: "destructive" });
      return;
    }
    setGeocoding(true);
    try {
      // Use the same suggest endpoint the dropdown uses and take the top hit,
      // so Locate gives the same precise pin as picking from the list. The
      // older /api/geocode endpoint retries with progressively shorter queries
      // and can land on a city-center fallback that overwrites a precise pin.
      const res = await fetch(`/api/geocode/suggest?q=${encodeURIComponent(q)}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Geocoding failed (${res.status})`);
      }
      const data = await res.json();
      const top: AddressSuggestion | undefined = Array.isArray(data?.results) ? data.results[0] : undefined;
      if (!top || !Number.isFinite(top.latitude) || !Number.isFinite(top.longitude)) {
        throw new Error("No matching address found");
      }
      applySuggestion(top);
      toast({ title: "Location found", description: top.displayName });
    } catch (err: any) {
      toast({ title: "Could not locate address", description: err.message, variant: "destructive" });
    } finally {
      setGeocoding(false);
    }
  };

  const getUploadParameters = async (file: any) => {
    const endpoint = projectId
      ? `/api/projects/${projectId}/images/upload-url`
      : `/api/projects/new/images/upload-url`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ contentType: file.type }),
    });
    if (!res.ok) throw new Error("Failed to get upload URL");
    const data = await res.json();
    return { method: "PUT" as const, url: data.uploadURL, headers: { "Content-Type": file.type } };
  };

  const handleUploadComplete = (result: any) => {
    const newImages: ProjectImage[] = [];
    for (const file of result.successful || []) {
      const url = file?.uploadURL?.split("?")[0];
      if (!url) continue;
      let servePath = url;
      try {
        const parsed = new URL(url);
        const parts = parsed.pathname.split("/").filter(Boolean);
        const last = parts[parts.length - 1];
        if (last) servePath = `/objects/uploads/${last}`;
      } catch {}
      newImages.push({ url: servePath, alt: file.name });
    }
    if (newImages.length > 0) {
      onChange({ images: [...images, ...newImages].slice(0, maxImages) });
    }
  };

  const removeImage = (idx: number) => {
    onChange({ images: images.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Location & Media</h3>
      </div>

      <div ref={wrapperRef} className="relative">
        <Label htmlFor="addressLine1">Address</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id="addressLine1"
              value={addressInput}
              onChange={(e) => { setAddressInput(e.target.value); setSuggestOpen(true); }}
              onFocus={() => { if (addressInput.trim().length >= 3) setSuggestOpen(true); }}
              onBlur={() => {
                if (addressInput !== (addressLine1 || "")) {
                  onChange({ addressLine1: addressInput });
                }
              }}
              onKeyDown={onAddressKeyDown}
              disabled={disabled}
              placeholder="Start typing an address…"
              autoComplete="off"
              data-testid="input-address"
            />
            {suggestLoading && (
              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {suggestOpen && suggestions.length > 0 && (
              <ul
                role="listbox"
                className="absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-auto rounded-md border bg-popover shadow-lg"
                data-testid="address-suggestions"
              >
                {suggestions.map((s, i) => (
                  <li
                    key={`${s.latitude},${s.longitude},${i}`}
                    role="option"
                    aria-selected={i === highlight}
                    onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
                    onMouseEnter={() => setHighlight(i)}
                    className={`cursor-pointer px-3 py-2 text-sm ${i === highlight ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"}`}
                    data-testid={`address-suggestion-${i}`}
                  >
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{s.displayName}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={handleGeocode}
            disabled={geocoding || disabled}
            data-testid="button-geocode"
          >
            {geocoding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MapPin className="h-4 w-4 mr-2" />}
            Locate
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Type at least 3 characters and pick a suggestion — we'll pin the project on the map automatically.
          {latitude && longitude ? (
            <span className="ml-1">· Pinned at {Number(latitude).toFixed(4)}, {Number(longitude).toFixed(4)}</span>
          ) : null}
        </p>
      </div>

      {(() => {
        const lat = latitude != null && latitude !== "" ? Number(latitude) : NaN;
        const lng = longitude != null && longitude !== "" ? Number(longitude) : NaN;
        const hasPin = Number.isFinite(lat) && Number.isFinite(lng);
        return (
          <div className="rounded-md border overflow-hidden bg-muted/30" style={{ height: 220 }} data-testid="location-map-preview">
            {hasPin ? (
              <MapContainer
                center={[lat, lng]}
                zoom={15}
                scrollWheelZoom={false}
                style={{ height: "100%", width: "100%" }}
                attributionControl={false}
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                  subdomains={["a", "b", "c", "d"]}
                  maxZoom={19}
                />
                <Marker position={[lat, lng]} />
                <RecenterMap lat={lat} lng={lng} />
              </MapContainer>
            ) : (
              <div className="h-full w-full flex flex-col items-center justify-center text-xs text-muted-foreground gap-1">
                <MapPin className="h-5 w-5" />
                <span>No location pinned yet</span>
                <span className="text-[10px]">Pick an address suggestion to see it on the map.</span>
              </div>
            )}
          </div>
        );
      })()}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" /> Project Images ({images.length}/{maxImages})
          </Label>
          {!disabled && images.length < maxImages && (
            <ObjectUploader
              maxNumberOfFiles={maxImages - images.length}
              maxFileSize={5 * 1024 * 1024}
              onGetUploadParameters={getUploadParameters}
              onComplete={handleUploadComplete}
              buttonClassName="h-8 px-3 text-xs"
            >
              <span className="inline-flex items-center"><Upload className="h-3 w-3 mr-1" /> Add Images</span>
            </ObjectUploader>
          )}
        </div>

        {images.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {images.map((img, i) => (
              <div key={i} className="group relative aspect-video rounded-md overflow-hidden border bg-muted">
                <img src={img.url} alt={img.alt || `Project image ${i + 1}`} className="w-full h-full object-cover" />
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                    data-testid={`button-remove-image-${i}`}
                    aria-label="Remove image"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No images uploaded yet. Up to {maxImages} images, max 5 MB each.</p>
        )}
      </div>
    </div>
  );
}
