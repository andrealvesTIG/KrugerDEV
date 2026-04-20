let loaderPromise: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps can only load in the browser"));
  }
  if ((window as any).google?.maps?.places) {
    return Promise.resolve((window as any).google);
  }
  if (loaderPromise) return loaderPromise;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (!apiKey) {
    return Promise.reject(new Error("VITE_GOOGLE_MAPS_API_KEY is not set"));
  }

  loaderPromise = new Promise((resolve, reject) => {
    const callbackName = "__frGoogleMapsReady__";
    (window as any)[callbackName] = () => {
      resolve((window as any).google);
      try { delete (window as any)[callbackName]; } catch {}
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=${callbackName}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      loaderPromise = null;
      reject(new Error("Failed to load Google Maps script"));
    };
    document.head.appendChild(script);
  });
  return loaderPromise;
}

export interface ParsedPlace {
  addressLine1: string;
  city: string;
  region: string;
  country: string;
  postalCode: string;
  latitude: string;
  longitude: string;
  displayName: string;
}

export function parsePlace(place: google.maps.places.PlaceResult): ParsedPlace {
  const components = place.address_components || [];
  const get = (type: string, short = false) => {
    const c = components.find((c) => c.types.includes(type));
    if (!c) return "";
    return short ? c.short_name : c.long_name;
  };

  const streetNumber = get("street_number");
  const route = get("route");
  const addressLine1 = [streetNumber, route].filter(Boolean).join(" ").trim();
  const city = get("locality") || get("postal_town") || get("sublocality") || get("sublocality_level_1");
  const region = get("administrative_area_level_1", true);
  const country = get("country");
  const postalCode = get("postal_code");

  const loc = place.geometry?.location;
  const latitude = loc ? String(typeof loc.lat === "function" ? loc.lat() : (loc as any).lat) : "";
  const longitude = loc ? String(typeof loc.lng === "function" ? loc.lng() : (loc as any).lng) : "";

  return {
    addressLine1,
    city,
    region,
    country,
    postalCode,
    latitude,
    longitude,
    displayName: place.formatted_address || place.name || "",
  };
}
