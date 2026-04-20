import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Loader2, MapPin, Upload, X, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Label htmlFor="addressLine1">Street Address</Label>
          <Input
            id="addressLine1"
            value={addressLine1 || ""}
            onChange={(e) => onChange({ addressLine1: e.target.value })}
            disabled={disabled}
            placeholder="123 Main St"
            data-testid="input-address"
          />
        </div>
        <div>
          <Label htmlFor="city">City</Label>
          <Input id="city" value={city || ""} onChange={(e) => onChange({ city: e.target.value })} disabled={disabled} data-testid="input-city" />
        </div>
        <div>
          <Label htmlFor="region">State / Region</Label>
          <Input id="region" value={region || ""} onChange={(e) => onChange({ region: e.target.value })} disabled={disabled} data-testid="input-region" />
        </div>
        <div>
          <Label htmlFor="postalCode">Postal Code</Label>
          <Input id="postalCode" value={postalCode || ""} onChange={(e) => onChange({ postalCode: e.target.value })} disabled={disabled} data-testid="input-postal" />
        </div>
        <div>
          <Label htmlFor="country">Country</Label>
          <Input id="country" value={country || ""} onChange={(e) => onChange({ country: e.target.value })} disabled={disabled} data-testid="input-country" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        <div>
          <Label htmlFor="latitude">Latitude</Label>
          <Input
            id="latitude"
            type="number"
            step="0.000001"
            value={latitude ?? ""}
            onChange={(e) => onChange({ latitude: e.target.value })}
            disabled={disabled}
            placeholder="40.7128"
            data-testid="input-latitude"
          />
        </div>
        <div>
          <Label htmlFor="longitude">Longitude</Label>
          <Input
            id="longitude"
            type="number"
            step="0.000001"
            value={longitude ?? ""}
            onChange={(e) => onChange({ longitude: e.target.value })}
            disabled={disabled}
            placeholder="-74.0060"
            data-testid="input-longitude"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleGeocode}
          disabled={geocoding || disabled}
          data-testid="button-geocode"
        >
          {geocoding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MapPin className="h-4 w-4 mr-2" />}
          Auto-locate
        </Button>
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
