import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Loader2, MapPin, Upload, X, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { loadGoogleMaps, parsePlace } from "@/lib/googleMaps";

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

  const addressInputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [autocompleteReady, setAutocompleteReady] = useState(false);

  // Keep latest callbacks in refs so the init effect doesn't re-run every render
  // when parent passes inline onChange handlers.
  const onChangeRef = useRef(onChange);
  const toastRef = useRef(toast);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  useEffect(() => {
    if (disabled) return;
    const input = addressInputRef.current;
    if (!input) return;
    let cancelled = false;
    let placeListener: google.maps.MapsEventListener | null = null;

    const MIN_CHARS = 3;
    const updateDropdownVisibility = () => {
      const len = (addressInputRef.current?.value || "").trim().length;
      document.querySelectorAll<HTMLElement>(".pac-container").forEach((el) => {
        el.style.display = len < MIN_CHARS ? "none" : "";
      });
    };
    input.addEventListener("input", updateDropdownVisibility);
    input.addEventListener("focus", updateDropdownVisibility);

    loadGoogleMaps()
      .then((google) => {
        if (cancelled || !addressInputRef.current) return;
        const ac = new google.maps.places.Autocomplete(addressInputRef.current, {
          fields: ["address_components", "geometry", "formatted_address", "name"],
          types: ["address"],
        });
        autocompleteRef.current = ac;
        updateDropdownVisibility();
        placeListener = ac.addListener("place_changed", () => {
          const place = ac.getPlace();
          if (!place || !place.address_components) {
            toastRef.current({ title: "Select a suggestion", description: "Pick an address from the dropdown.", variant: "destructive" });
            return;
          }
          const parsed = parsePlace(place);
          // Store the full formatted address in addressLine1 so the single
          // input shows the complete location. Also populate city/region/etc
          // behind the scenes for map filters and downstream features.
          const patch: ProjectLocationPatch = {};
          patch.addressLine1 = parsed.displayName || parsed.addressLine1 || addressInputRef.current?.value || "";
          if (parsed.city) patch.city = parsed.city;
          if (parsed.region) patch.region = parsed.region;
          if (parsed.country) patch.country = parsed.country;
          if (parsed.postalCode) patch.postalCode = parsed.postalCode;
          if (parsed.latitude) patch.latitude = parsed.latitude;
          if (parsed.longitude) patch.longitude = parsed.longitude;
          onChangeRef.current(patch);
        });
        setAutocompleteReady(true);
      })
      .catch((err) => {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.warn("[google-maps] autocomplete disabled:", err?.message || err);
        }
      });

    return () => {
      cancelled = true;
      input.removeEventListener("input", updateDropdownVisibility);
      input.removeEventListener("focus", updateDropdownVisibility);
      if (placeListener) placeListener.remove();
      const g = (window as any).google;
      if (autocompleteRef.current && g?.maps?.event) {
        g.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
      autocompleteRef.current = null;
      // Google leaves its .pac-container dropdowns attached to <body>. Leave
      // them — they're cheap, reused by other instances, and removing them
      // globally would clobber other autocomplete inputs on the page.
    };
  }, [disabled]);

  const addressString = [addressLine1, city, region, postalCode, country].filter(Boolean).join(", ");

  const handleGeocode = async () => {
    if (!addressString) {
      toast({ title: "Address required", description: "Enter at least a city or street address first.", variant: "destructive" });
      return;
    }
    setGeocoding(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(addressString)}`, { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Geocoding failed (${res.status})`);
      }
      const data = await res.json();
      onChange({ latitude: String(data.latitude), longitude: String(data.longitude) });
      toast({ title: "Location found", description: data.displayName });
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

      <div>
        <Label htmlFor="addressLine1">Address</Label>
        <div className="flex gap-2">
          <Input
            id="addressLine1"
            ref={addressInputRef}
            value={addressLine1 || ""}
            onChange={(e) => onChange({ addressLine1: e.target.value })}
            disabled={disabled}
            placeholder={autocompleteReady ? "Start typing an address…" : "Enter an address"}
            autoComplete="off"
            data-testid="input-address"
            className="flex-1"
          />
          {!autocompleteReady && (
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
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          {autocompleteReady
            ? "Start typing, then pick a suggestion — we'll pin the project on the map automatically."
            : "Enter an address and press Locate to pin the project on the map."}
          {latitude && longitude ? (
            <span className="ml-1">· Pinned at {Number(latitude).toFixed(4)}, {Number(longitude).toFixed(4)}</span>
          ) : null}
        </p>
      </div>

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
