import { useEffect,useRef,useState,type ReactNode } from "react";

export type DeviceSize = "mobile" | "tablet" | "desktop";

function useScaleToFit(naturalW: number, naturalH: number) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = hostRef.current;
    if (!element) return;
    const measure = () => {
      const { clientWidth: width, clientHeight: height } = element;
      if (width < 8 || height < 8) return;
      setScale(Math.min(1, width / naturalW, height / naturalH));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [naturalW, naturalH]);

  return { hostRef, scale };
}

export function PhoneFrame({ children }: { children: ReactNode }) {
  const { hostRef, scale } = useScaleToFit(390, 812);
  return (
    <div ref={hostRef} data-device-container className="relative flex h-full w-full items-center justify-center overflow-hidden py-4">
      <div
        data-scaled-iframe
        className="relative flex flex-col rounded-[44px] overflow-hidden shadow-[0_0_0_2px_#3a3a3c,0_0_0_8px_#1c1c1e,0_20px_60px_rgba(0,0,0,0.7)] origin-center"
        style={{ width: 390, height: 812, background: "#000", flexShrink: 0, transform: `scale(${scale})` }}
      >
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-full z-20 flex items-center justify-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a]" />
          <div className="w-3.5 h-3.5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a]" />
        </div>
        <div className="relative z-10 flex items-center justify-between px-8 pt-4 pb-1 text-white bg-transparent pointer-events-none">
          <span className="text-[13px] font-semibold">9:41</span>
          <div className="flex items-center gap-1.5 text-white">
            <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor" opacity="0.9"><rect x="0" y="3" width="3" height="9" rx="1"/><rect x="4.5" y="2" width="3" height="10" rx="1"/><rect x="9" y="0" width="3" height="12" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1" opacity="0.3"/></svg>
            <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" opacity="0.9"><path d="M8 2.4C5.1 2.4 2.5 3.7 0.8 5.8L2.2 7.2C3.5 5.5 5.6 4.4 8 4.4s4.5 1.1 5.8 2.8l1.4-1.4C13.5 3.7 10.9 2.4 8 2.4zM8 6.4c-1.6 0-3 .7-4 1.8L5.4 9.6C6.1 8.8 7 8.4 8 8.4s1.9.4 2.6 1.2l1.4-1.4C11 7.1 9.6 6.4 8 6.4zM8 10.4c-.6 0-1.1.2-1.5.5L8 13l1.5-2.1c-.4-.3-.9-.5-1.5-.5z"/></svg>
            <svg width="25" height="12" viewBox="0 0 25 12" fill="currentColor" opacity="0.9"><rect x="0" y="1" width="21" height="10" rx="2.5" stroke="white" strokeWidth="1" fill="none" opacity="0.4"/><rect x="22" y="4" width="3" height="4" rx="1"/><rect x="1.5" y="2.5" width="16" height="7" rx="1.5"/></svg>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">{children}</div>
        <div className="flex justify-center pb-2 pt-1 bg-black">
          <div className="w-28 h-1 bg-white/30 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function TabletFrame({ children }: { children: ReactNode }) {
  const { hostRef, scale } = useScaleToFit(768, 680);
  return (
    <div ref={hostRef} data-device-container className="relative flex h-full w-full items-center justify-center overflow-hidden py-4">
      <div
        data-scaled-iframe
        className="relative rounded-[24px] overflow-hidden shadow-[0_0_0_2px_#3a3a3c,0_0_0_10px_#1c1c1e,0_20px_60px_rgba(0,0,0,0.7)] origin-center"
        style={{ width: 768, height: 680, background: "#000", flexShrink: 0, transform: `scale(${scale})` }}
      >
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#2a2a2a] rounded-full z-20 border border-[#3a3a3c]" />
        <div className="relative z-10 flex items-center justify-between px-6 pt-2 pb-1 text-white bg-transparent pointer-events-none">
          <span className="text-[12px] font-semibold">9:41</span>
          <div className="flex items-center gap-1.5">
            <svg width="16" height="11" viewBox="0 0 17 12" fill="currentColor" opacity="0.9"><rect x="0" y="3" width="3" height="9" rx="1"/><rect x="4.5" y="2" width="3" height="10" rx="1"/><rect x="9" y="0" width="3" height="12" rx="1"/></svg>
            <svg width="22" height="11" viewBox="0 0 25 12" fill="currentColor" opacity="0.9"><rect x="0" y="1" width="21" height="10" rx="2.5" stroke="white" strokeWidth="1" fill="none" opacity="0.4"/><rect x="22" y="4" width="3" height="4" rx="1"/><rect x="1.5" y="2.5" width="16" height="7" rx="1.5"/></svg>
          </div>
        </div>
        <div className="flex-1 overflow-hidden h-[calc(100%-32px)]">{children}</div>
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-20 h-1 bg-white/20 rounded-full" />
      </div>
    </div>
  );
}
