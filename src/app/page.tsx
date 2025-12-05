'use client';

import { useState, useEffect } from 'react';
import { SwensyncOverlay } from '@/components/swensync';
import { Mic, ChevronDown, ChevronUp } from 'lucide-react';
import { isMobile } from 'react-device-detect';

export default function Home() {
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
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  // Background style based on device and orientation
  const getBackgroundImage = () => {
    if (!isMobileDevice) return '/landscape1920X1080.png'; // Desktop
    if (isLandscape) return '/landscape-background.png'; // Mobile landscape
    return '/portrait-background.png'; // Mobile portrait
  };

  const backgroundStyle = {
    backgroundImage: `url(${getBackgroundImage()})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  return (
    <main
      className="min-h-screen flex flex-col p-8"
      style={backgroundStyle}
    >
      {/* Tagline and About Us at top - background image has branding */}
      <div className="text-center pt-2 pb-4">
        <p className="text-lg text-foreground/80 font-medium">
          The Fastest Conversational Voice Service
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
            Start Conversation
          </button>
        </div>
      </div>

      {/* About Us Content */}
      {isAboutOpen && (
        <div className="mt-8 max-w-3xl mx-auto text-left bg-card border border-border rounded-2xl p-8 shadow-lg">
          <h2 className="text-2xl font-bold text-foreground mb-6">
            Swensync: Breakthrough Latency Engineering for Real-Time Voice AI
          </h2>

          <section className="space-y-6 text-muted-foreground">
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                The Problem: Voice AI Still Feels Slow
              </h3>
              <p>
                Across the industry, voice AI systems continue to struggle with the same friction point: the noticeable lag between a user finishing a sentence and the system responding. Even leading platforms often land in the 800ms–1.4s range, which is slow enough to break the illusion of natural conversation.
              </p>
              <p className="mt-2">
                This delay comes from multiple bottlenecks across detection, networking, and processing — but the critical one is knowing exactly when the user has finished speaking. That&apos;s where most systems lose time.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Our Breakthrough: Next-Generation Turn Detection
              </h3>
              <p>
                Swensync has developed an advanced, patent-pending approach to turn detection that dramatically accelerates response time without compromising accuracy or reliability.
              </p>
              <p className="mt-2">
                Instead of relying on a single system to determine when to trigger AI processing, we incorporate a multi-layer detection strategy that allows the fastest, most reliable signal to initiate the response pipeline. This architecture enables us to consistently start inference earlier than traditional voice stacks.
              </p>
              <p className="mt-2 font-medium text-foreground">
                The high-level result: We eliminate hundreds of milliseconds of dead air that competitors can&apos;t avoid.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Measured Performance
              </h3>
              <p className="mb-4">
                In real-world tests across short phrases, sentences, and long-form speech, Swensync delivers an average <span className="font-semibold text-foreground">35–45% reduction in response time</span> compared to standard voice AI pipelines.
              </p>
              <div className="bg-background rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Short phrases:</span>
                  <span>Industry: 800–1000ms → <span className="text-green-500 font-medium">Swensync: 450–600ms</span></span>
                </div>
                <div className="flex justify-between">
                  <span>Full sentences:</span>
                  <span>Industry: 900–1200ms → <span className="text-green-500 font-medium">Swensync: 550–750ms</span></span>
                </div>
                <div className="flex justify-between">
                  <span>Paragraphs:</span>
                  <span>Industry: 1000–1400ms → <span className="text-green-500 font-medium">Swensync: 650–900ms</span></span>
                </div>
              </div>
              <p className="mt-3">
                This moves the system from &quot;robotic&quot; to &quot;conversational&quot; — a shift users immediately feel.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Why We Win
              </h3>
              <ul className="space-y-3">
                <li>
                  <span className="font-medium text-foreground">User Experience That Feels Human:</span>{' '}
                  Sub-600ms responses cross the threshold where interactions begin to feel natural, effortless, and intuitive.
                </li>
                <li>
                  <span className="font-medium text-foreground">Deep Technical Expertise:</span>{' '}
                  Latency reduction isn&apos;t purchased — it&apos;s engineered. Swensync combines audio processing, edge inference, and real-time systems design to optimize latency across the entire pipeline.
                </li>
                <li>
                  <span className="font-medium text-foreground">Backend-Agnostic Architecture:</span>{' '}
                  Our detection and acceleration framework works with any LLM or TTS vendor, giving us flexibility and resilience as the ecosystem evolves.
                </li>
                <li>
                  <span className="font-medium text-foreground">Visibility &amp; Reliability:</span>{' '}
                  Built-in telemetry and health checks ensure consistent performance across varied environments.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Architecture Principles
              </h3>
              <p className="mb-3">Our architecture is built on:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Client-accelerated speech boundary detection to reduce the need for slow, centralized processing.</li>
                <li>Parallelized detection paths that allow the fastest reliable signal to trigger the AI.</li>
                <li>Edge-first processing to reliably eliminate unnecessary round trips.</li>
                <li>Graceful fallback logic to maintain accuracy even in noisy or high-latency environments.</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Future Roadmap
              </h3>
              <p className="mb-3">
                Swensync continues to push toward <span className="font-semibold text-foreground">sub-400ms total response time</span>, leveraging:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>Adaptive detection tuned to ambient environments</li>
                <li>Predictive modeling to anticipate speech boundaries</li>
                <li>Custom-trained detection models optimized for conversational AI</li>
              </ul>
              <p className="mt-3">
                Each step compounds our existing lead in latency performance.
              </p>
            </div>

            <div className="border-t border-border pt-6">
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Summary
              </h3>
              <p>
                Swensync is solving one of the hardest unsolved UX problems in voice AI: making responses feel instantaneous. Our advanced detection architecture, combined with deep infrastructure optimization, yields meaningful, defensible performance gains that directly improve user satisfaction and engagement.
              </p>
              <p className="mt-4 text-lg font-medium text-foreground italic">
                We aren&apos;t just making voice AI faster — we&apos;re making it feel human.
              </p>
            </div>

            <div className="border-t border-border pt-6">
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Contact Us
              </h3>
              <p>
                Interested in learning more or exploring partnership opportunities?
              </p>
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
