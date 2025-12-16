"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SwensyncOverlay } from "@/components/swensync";
import { Mic, Users, ChevronDown, ChevronUp } from "lucide-react";
import { isMobile } from "react-device-detect";

export default function Home() {
  const router = useRouter();
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);

  // Detect mobile device and orientation
  useEffect(() => {
    const checkOrientation = () => {
      const landscape = window.innerWidth > window.innerHeight;
      setIsLandscape(landscape);
      setIsMobileDevice(isMobile);
    };

    checkOrientation();
    window.addEventListener("resize", checkOrientation);
    window.addEventListener("orientationchange", checkOrientation);

    return () => {
      window.removeEventListener("resize", checkOrientation);
      window.removeEventListener("orientationchange", checkOrientation);
    };
  }, []);

  // Background style based on device and orientation
  const getBackgroundImage = () => {
    if (!isMobileDevice) return "/landscape1920X1080.png"; // Desktop
    if (isLandscape) return "/landscape-background.png"; // Mobile landscape
    return "/portrait-background.png"; // Mobile portrait
  };

  const backgroundStyle = {
    backgroundImage: `url(${getBackgroundImage()})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
  };

  return (
    <main
      className="h-dvh h-screen flex flex-col p-8 fixed inset-0 overflow-y-auto touch-scroll overscroll-contain"
      style={backgroundStyle}
    >
      {/* Tagline and About Us at top - background image has branding */}
      <div className="text-center pt-2 pb-4">
        <p className="text-lg text-foreground/80 font-medium">
          The AI Collaboration Engine
        </p>
        <button
          onClick={() => setIsAboutOpen(!isAboutOpen)}
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium mt-2"
        >
          About Us
          {isAboutOpen ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Main content - centered */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="text-center flex flex-col items-center gap-6">
          <button
            onClick={() => setIsOverlayOpen(true)}
            className="inline-flex items-center gap-3 px-8 py-4 bg-primary text-primary-foreground rounded-full text-lg font-semibold hover:opacity-90 transition-opacity"
          >
            <Mic className="w-6 h-6" />
            Find Out More
          </button>
          <button
            onClick={() => router.push("/rooms")}
            className="inline-flex items-center gap-3 px-8 py-4 bg-primary text-primary-foreground rounded-full text-lg font-semibold hover:opacity-90 transition-opacity"
          >
            <Users className="w-6 h-6" />
            Share A Conversation
          </button>
        </div>
      </div>

      {/* About Us Content */}
      {isAboutOpen && (
        <div className="mt-8 max-w-3xl mx-auto text-left bg-card border border-border rounded-2xl p-8 shadow-lg">
          <h2 className="text-2xl font-bold text-foreground mb-4">
            About Swensync
          </h2>
          <h3 className="text-xl font-semibold text-foreground mb-6">
            Shared Intelligence for the Next Era of Human Collaboration
          </h3>

          <section className="space-y-6 text-muted-foreground">
            <div>
              <p>
                Most AI today thinks in isolation. It talks to individuals, not
                groups. It doesn&apos;t understand the dynamics of a room, the
                flow of multi-participant conversations, or the shared context
                teams rely on to make decisions.
              </p>
              <p className="mt-2">
                Swensync was created to solve this foundational gap.
              </p>
              <p className="mt-2">
                We build synchronized, shared AI inference systems that allow
                multiple humans to interact with a single, coherent AI
                participant — together, in real time. Instead of isolated
                outputs and fragmented insights, Swensync creates unified
                experiences where AI listens to the group, responds to the
                group, and evolves with the group.
              </p>
            </div>

            <div className="border-t border-border pt-6">
              <h3 className="text-lg font-semibold text-foreground mb-2">
                The Problem We Solve
              </h3>
              <p>
                Traditional AI pipelines treat every conversation as a
                one-to-one exchange. That breaks the moment humans need AI to
                operate in collaborative environments, including:
              </p>
              <ul className="list-disc list-inside space-y-1 mt-3">
                <li>Strategy sessions and decision rooms</li>
                <li>Training, workshops, and group learning</li>
                <li>Cross-functional product ideation</li>
                <li>Sales and account planning</li>
                <li>Healthcare case conferences</li>
                <li>Financial and risk review committees</li>
                <li>Customer support war rooms</li>
              </ul>
              <p className="mt-3">
                In all of these, isolated AI creates inconsistency,
                fragmentation, and misalignment.
              </p>
              <p className="mt-2">
                Swensync eliminates that by enabling AI to participate in
                multi-user environments as a synchronized, context-aware
                teammate.
              </p>
            </div>

            <div className="border-t border-border pt-6">
              <h3 className="text-lg font-semibold text-foreground mb-2">
                What Swensync Enables
              </h3>
              <p className="mb-4">
                Swensync re-architects the AI experience around shared
                intelligence:
              </p>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-foreground">
                    Synchronized Inference
                  </h4>
                  <p>
                    One AI call produces a consistent, simultaneous output for
                    every participant.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">
                    Unified Shared Context
                  </h4>
                  <p>
                    All users contribute to and receive from the same evolving
                    state, eliminating fragmentation.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">
                    Real-Time Group Awareness
                  </h4>
                  <p>
                    AI that reacts to conversation dynamics, cross-talk, roles,
                    and collective decision-making.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">
                    Coordinated Multimodal Actions
                  </h4>
                  <p>
                    Audio, visualizations, and interface updates delivered in
                    sync across devices.
                  </p>
                </div>
              </div>
              <p className="mt-4">
                This transforms AI from a personal assistant into an aligned
                collaborator.
              </p>
            </div>

            <div className="border-t border-border pt-6">
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Enterprise Use Cases
              </h3>
              <p className="mb-4">
                Swensync unlocks outcomes isolated AI can&apos;t deliver:
              </p>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-foreground">
                    Collaborative Decision Rooms
                  </h4>
                  <p>
                    A shared AI facilitator synthesizes multi-person input and
                    presents unified insights.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">
                    AI-Augmented Workshops &amp; Training
                  </h4>
                  <p>
                    Adaptive group experiences with synchronized exercises,
                    checkpoints, and guided learning.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">
                    Cross-Functional Innovation Labs
                  </h4>
                  <p>
                    AI amplifies collective creativity by synthesizing ideas
                    from the entire group in real time.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">
                    Enterprise Sales &amp; Deal Strategy
                  </h4>
                  <p>
                    Unified AI-driven messaging, objection handling, and
                    preparation across account teams.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">
                    Healthcare Case Conferences
                  </h4>
                  <p>
                    Group-aware recommendations with synchronized data views and
                    shared clinical context.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">
                    Financial &amp; Risk Committees
                  </h4>
                  <p>
                    Aligned modeling and scenario analysis that ensures every
                    participant shares the same assumptions.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">
                    Customer Support Response Centers
                  </h4>
                  <p>
                    AI acting as a real-time mission controller to coordinate
                    information across agents.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t border-border pt-6">
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Our Vision
              </h3>
              <p>
                We believe the future of AI isn&apos;t one-to-one — it&apos;s
                many-to-one and many-to-many.
              </p>
              <p className="mt-2">
                Human collaboration has always produced the world&apos;s
                greatest breakthroughs. Swensync exists to amplify that
                collaborative energy by giving teams a shared AI participant
                capable of:
              </p>
              <ul className="list-disc list-inside space-y-1 mt-3">
                <li>understanding the full group</li>
                <li>maintaining synchronized state across users</li>
                <li>coordinating responses and actions</li>
                <li>enhancing decision quality and creativity</li>
              </ul>
              <p className="mt-3">
                We build technology that helps humans achieve outcomes no single
                person — or isolated AI model — could accomplish alone.
              </p>
            </div>

            <div className="border-t border-border pt-6">
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Contact
              </h3>
              <p>Interested in partnering or learning more?</p>
              <p className="mt-2">
                <a
                  href="mailto:matt@chnl.net"
                  className="text-blue-400 hover:text-blue-300 transition-colors font-medium"
                >
                  matt@chnl.net
                </a>
              </p>
            </div>
          </section>
        </div>
      )}

      <SwensyncOverlay
        isOpen={isOverlayOpen}
        onClose={() => setIsOverlayOpen(false)}
      />
    </main>
  );
}
