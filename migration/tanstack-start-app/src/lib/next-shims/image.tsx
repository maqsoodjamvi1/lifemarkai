import type { ImgHTMLAttributes, ReactNode } from "react";

type NextImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  alt: string;
  width?: number | string;
  height?: number | string;
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
  loader?: unknown;
  quality?: number;
  placeholder?: "blur" | "empty";
  blurDataURL?: string;
  sizes?: string;
};

/** Minimal `next/image` → plain <img> for Vite / TanStack Start. */
export default function Image({
  src,
  alt,
  width,
  height,
  fill,
  style,
  className,
  ...rest
}: NextImageProps): ReactNode {
  const { loader: _l, priority: _p, unoptimized: _u, quality: _q, placeholder: _ph, blurDataURL: _b, sizes: _s, ...imgRest } =
    rest as NextImageProps & Record<string, unknown>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...imgRest}
      src={src}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      className={className}
      style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", ...style } : style}
    />
  );
}
