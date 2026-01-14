import { useEffect, useState } from "react";

interface HoneypotData {
  honeypot1: string;
  honeypot2: string;
  formLoadTime: number;
}

interface HoneypotFieldProps {
  onDataChange: (data: HoneypotData) => void;
}

export function HoneypotField({ onDataChange }: HoneypotFieldProps) {
  const [formLoadTime] = useState(() => Date.now());

  useEffect(() => {
    onDataChange({
      honeypot1: "",
      honeypot2: "",
      formLoadTime,
    });
  }, [formLoadTime, onDataChange]);

  return (
    <>
      <div
        style={{
          position: "absolute",
          left: "-9999px",
          width: "1px",
          height: "1px",
          overflow: "hidden",
        }}
        aria-hidden="true"
      >
        <label htmlFor="website_url">Website URL</label>
        <input
          type="text"
          id="website_url"
          name="website_url"
          tabIndex={-1}
          autoComplete="off"
          onChange={(e) => {
            onDataChange({
              honeypot1: e.target.value,
              honeypot2: "",
              formLoadTime,
            });
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: "-9999px",
          width: "1px",
          height: "1px",
          overflow: "hidden",
        }}
        aria-hidden="true"
      >
        <label htmlFor="phone_number">Phone Number</label>
        <input
          type="text"
          id="phone_number"
          name="phone_number"
          tabIndex={-1}
          autoComplete="off"
          onChange={(e) => {
            onDataChange({
              honeypot1: "",
              honeypot2: e.target.value,
              formLoadTime,
            });
          }}
        />
      </div>
    </>
  );
}

export function validateHoneypotClient(data: HoneypotData): { valid: boolean; error?: string } {
  if (data.honeypot1 || data.honeypot2) {
    return { valid: false, error: "Invalid submission detected" };
  }
  
  const submissionTime = Date.now();
  const timeElapsed = submissionTime - data.formLoadTime;
  const minimumTimeMs = 2000;
  
  if (timeElapsed < minimumTimeMs) {
    return { valid: false, error: "Please take your time filling out the form" };
  }
  
  return { valid: true };
}
