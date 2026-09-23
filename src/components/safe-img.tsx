import * as React from "react";

/** <img> that removes itself when the source fails, letting the soft background show. */
export function SafeImg({ src, className, alt = "", ...props }: React.ComponentProps<"img">) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);
  if (!src || failed) return null;
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={className} {...props} />;
}
