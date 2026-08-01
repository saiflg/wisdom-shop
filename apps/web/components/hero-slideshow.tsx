"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";

export interface HeroSlide {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  imageUrl: string;
}

const INTERVAL_MS = 6000;

export function HeroSlideshow({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const goTo = useCallback(
    (next: number) => setIndex(((next % slides.length) + slides.length) % slides.length),
    [slides.length],
  );

  useEffect(() => {
    if (paused) return;
    // Respect the OS-level reduced-motion preference: no forced auto-advance,
    // the visitor drives the carousel with the arrows/dots instead.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = setInterval(() => setIndex((current) => (current + 1) % slides.length), INTERVAL_MS);
    return () => clearInterval(timer);
  }, [paused, slides.length]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured highlights"
      className="relative isolate overflow-hidden bg-slate-900"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="relative h-[440px] sm:h-[500px] lg:h-[580px]">
        {slides.map((slide, i) => {
          const active = i === index;
          return (
            <div
              key={slide.id}
              aria-hidden={!active}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${slides.length}`}
              className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                active ? "z-10 opacity-100" : "z-0 opacity-0"
              }`}
            >
              <div className="absolute inset-0 overflow-hidden">
                <Image
                  src={slide.imageUrl}
                  alt=""
                  fill
                  priority={i === 0}
                  sizes="100vw"
                  className={`object-cover motion-reduce:animate-none ${active ? "animate-ken-burns" : ""}`}
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/55 to-slate-950/25" />

              <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-end px-6 pb-16 sm:px-10 sm:pb-20">
                {active && (
                  <div className="max-w-xl">
                    <span className="inline-block animate-fade-in-up rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur motion-reduce:animate-none">
                      {slide.eyebrow}
                    </span>
                    <h2 className="mt-4 animate-fade-in-up text-3xl font-bold tracking-tight text-white motion-reduce:animate-none [animation-delay:100ms] sm:text-5xl">
                      {slide.title}
                    </h2>
                    <p className="mt-4 max-w-lg animate-fade-in-up text-base text-slate-200 motion-reduce:animate-none [animation-delay:200ms] sm:text-lg">
                      {slide.description}
                    </p>
                    <Link
                      href={slide.ctaHref}
                      className="mt-6 inline-block w-fit animate-fade-in-up rounded-full bg-brand-gradient px-6 py-3 text-sm font-semibold text-white transition hover:opacity-90 motion-reduce:animate-none [animation-delay:300ms]"
                    >
                      {slide.ctaLabel}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => goTo(index - 1)}
        aria-label="Previous slide"
        className="absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white backdrop-blur transition hover:bg-white/25 sm:left-6"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => goTo(index + 1)}
        aria-label="Next slide"
        className="absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white backdrop-blur transition hover:bg-white/25 sm:right-6"
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 gap-2">
        {slides.map((slide, i) => (
          <button
            key={slide.id}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={i === index}
            className={`h-2 rounded-full transition-all ${
              i === index ? "w-8 bg-white" : "w-2 bg-white/40 hover:bg-white/60"
            }`}
          />
        ))}
      </div>
    </section>
  );
}
