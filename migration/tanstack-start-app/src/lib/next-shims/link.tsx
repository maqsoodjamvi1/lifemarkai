import { Link as TanStackLink } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";

type Props = {
  href: string;
  children?: ReactNode;
  className?: string;
  replace?: boolean;
  prefetch?: boolean;
  onClick?: ComponentProps<"a">["onClick"];
  target?: string;
  rel?: string;
};

/** Drop-in for `next/link` → TanStack Router `<Link to>`. */
export default function Link({ href, children, className, replace, onClick, target, rel }: Props) {
  if (target === "_blank" || href.startsWith("http") || href.startsWith("mailto:")) {
    return (
      <a href={href} className={className} onClick={onClick} target={target} rel={rel}>
        {children}
      </a>
    );
  }
  return (
    <TanStackLink to={href} className={className} replace={replace} onClick={onClick as never}>
      {children}
    </TanStackLink>
  );
}
