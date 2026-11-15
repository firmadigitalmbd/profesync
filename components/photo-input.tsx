"use client";

import * as React from "react";
import { Camera } from "lucide-react";

import { compressSquareImage } from "@/lib/image-compress";

/**
 * Selector de foto: recorta a cuadrado y comprime en el navegador antes de
 * enviar el formulario (el archivo comprimido reemplaza al original).
 */
export function PhotoInput({
  name = "photo",
  currentUrl,
  label = "Foto",
}: {
  name?: string;
  currentUrl?: string | null;
  label?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(currentUrl ?? null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const compressed = await compressSquareImage(file);
      const transfer = new DataTransfer();
      transfer.items.add(compressed);
      if (inputRef.current) inputRef.current.files = transfer.files;
      setPreview(URL.createObjectURL(compressed));
    } catch {
      setError("No se pudo procesar la imagen");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <label className="relative flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-brand-border bg-black/5 text-brand-muted hover:bg-black/10">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <Camera className="h-6 w-6" />
        )}
        <input
          ref={inputRef}
          type="file"
          name={name}
          accept="image/*"
          onChange={handleChange}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <div className="text-sm">
        <p className="font-medium text-brand-ink">{label}</p>
        <p className="text-xs text-brand-muted">Toca el círculo para elegir o tomar una foto.</p>
        {error && <p className="text-xs text-brand-danger">{error}</p>}
      </div>
    </div>
  );
}
