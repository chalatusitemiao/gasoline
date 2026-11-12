import { useSyncExternalStore } from "react";
import type { AppLinkProps } from "@/components/app-navigation";

export function desktopLocation() {
  const { pathname, search, hash } = window.location;
  return pathname + search + hash;
}

function subscribe(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener("hashchange", listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener("hashchange", listener);
  };
}

export function useDesktopLocation() {
  return useSyncExternalStore(subscribe, desktopLocation);
}

function navigate(href: string, replace: boolean) {
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin) return;
  const target = url.pathname + url.search + url.hash;
  if (target === desktopLocation()) return;
  const differentPage = url.pathname !== window.location.pathname;
  if (replace) window.history.replaceState(null, "", target);
  else window.history.pushState(null, "", target);
  window.dispatchEvent(new PopStateEvent("popstate"));
  if (differentPage) window.scrollTo(0, 0);
}

export function replaceDesktopLocation(href: string) {
  navigate(href, true);
}

export function DesktopLink({ href, onClick, ...props }: AppLinkProps) {
  return (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey ||
            event.shiftKey || event.altKey || props.target === "_blank" || props.download ||
            !href.startsWith("/") || href.startsWith("//")) return;
        event.preventDefault();
        navigate(href, false);
      }}
    />
  );
}
