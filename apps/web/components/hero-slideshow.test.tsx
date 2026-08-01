import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HeroSlideshow, type HeroSlide } from "@/components/hero-slideshow";

// jsdom has no matchMedia. The component reads prefers-reduced-motion before
// arming the auto-advance timer, so every test needs this stubbed one way or
// another; individual tests override `matches` where the reduced-motion path
// itself is under test.
function stubMatchMedia(matches: boolean) {
  window.matchMedia = jest.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
}

const SLIDES: HeroSlide[] = [
  {
    id: "one",
    eyebrow: "First",
    title: "First slide title",
    description: "First slide description",
    ctaLabel: "Go one",
    ctaHref: "/one",
    imageUrl: "https://images.unsplash.com/photo-one",
  },
  {
    id: "two",
    eyebrow: "Second",
    title: "Second slide title",
    description: "Second slide description",
    ctaLabel: "Go two",
    ctaHref: "/two",
    imageUrl: "https://images.unsplash.com/photo-two",
  },
  {
    id: "three",
    eyebrow: "Third",
    title: "Third slide title",
    description: "Third slide description",
    ctaLabel: "Go three",
    ctaHref: "/three",
    imageUrl: "https://images.unsplash.com/photo-three",
  },
];

describe("HeroSlideshow", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows the first slide's content and hides the rest from assistive tech", () => {
    stubMatchMedia(false);
    render(<HeroSlideshow slides={SLIDES} />);

    expect(screen.getByRole("heading", { name: "First slide title" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Second slide title" })).not.toBeInTheDocument();

    const groups = screen.getAllByRole("group", { hidden: true });
    expect(groups[0]).toHaveAttribute("aria-hidden", "false");
    expect(groups[1]).toHaveAttribute("aria-hidden", "true");
    expect(groups[2]).toHaveAttribute("aria-hidden", "true");
  });

  it("advances to the next slide on click", async () => {
    stubMatchMedia(false);
    const user = userEvent.setup();
    render(<HeroSlideshow slides={SLIDES} />);

    await user.click(screen.getByRole("button", { name: "Next slide" }));

    expect(screen.getByRole("heading", { name: "Second slide title" })).toBeInTheDocument();
  });

  it("wraps from the last slide back to the first", async () => {
    stubMatchMedia(false);
    const user = userEvent.setup();
    render(<HeroSlideshow slides={SLIDES} />);

    await user.click(screen.getByRole("button", { name: "Previous slide" }));

    expect(screen.getByRole("heading", { name: "Third slide title" })).toBeInTheDocument();
  });

  it("jumps straight to a slide via its dot", async () => {
    stubMatchMedia(false);
    const user = userEvent.setup();
    render(<HeroSlideshow slides={SLIDES} />);

    await user.click(screen.getByRole("button", { name: "Go to slide 3" }));

    expect(screen.getByRole("heading", { name: "Third slide title" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to slide 3" })).toHaveAttribute("aria-current", "true");
  });

  it("auto-advances on a timer", () => {
    stubMatchMedia(false);
    jest.useFakeTimers();
    render(<HeroSlideshow slides={SLIDES} />);

    expect(screen.getByRole("heading", { name: "First slide title" })).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(6000);
    });

    expect(screen.getByRole("heading", { name: "Second slide title" })).toBeInTheDocument();
  });

  it("does not auto-advance when the visitor prefers reduced motion", () => {
    stubMatchMedia(true);
    jest.useFakeTimers();
    render(<HeroSlideshow slides={SLIDES} />);

    act(() => {
      jest.advanceTimersByTime(20000);
    });

    // Manual controls must still work — only the automatic timer is skipped.
    expect(screen.getByRole("heading", { name: "First slide title" })).toBeInTheDocument();
  });
});
