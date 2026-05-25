import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Globe, ArrowRight, Instagram, Twitter, Loader2 } from "lucide-react";
import { db, OperationType, handleFirestoreError, auth } from "./firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import AdminPanel from "./components/AdminPanel";

export default function App() {
  const [email, setEmail] = useState("");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showManifesto, setShowManifesto] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // View state: standard site or administrative dashboard
  const [view, setView] = useState<"site" | "admin">("site");

  // Authentication states
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Admin access validation
  const ADMIN_EMAILS = ["mrx.exeaep@gmail.com", "mniabyss@gmail.com"];
  const isAdminUser = !!(currentUser && currentUser.email && ADMIN_EMAILS.includes(currentUser.email.toLowerCase().trim()));

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fadeRafRef = useRef<number | null>(null);
  const fadingOutRef = useRef<boolean>(false);

  // Custom requestAnimationFrame-based fade animator
  const startFade = (targetOpacity: number, duration: number) => {
    if (fadeRafRef.current) {
      cancelAnimationFrame(fadeRafRef.current);
      fadeRafRef.current = null;
    }

    const video = videoRef.current;
    if (!video) return;

    // Read current opacity of the video directly from style to enable resumption
    const currentStyleOpacity = video.style.opacity;
    const startOpacity = currentStyleOpacity ? parseFloat(currentStyleOpacity) : 0;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Interpolate from current opacity style rather than snapping
      const currentOpacity = startOpacity + (targetOpacity - startOpacity) * progress;
      
      if (video) {
        video.style.opacity = currentOpacity.toFixed(4);
      }

      if (progress < 1) {
        fadeRafRef.current = requestAnimationFrame(animate);
      } else {
        fadeRafRef.current = null;
      }
    };

    fadeRafRef.current = requestAnimationFrame(animate);
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    const duration = video.duration;
    const currentTime = video.currentTime;

    if (duration && !isNaN(duration) && duration > 0 && !fadingOutRef.current) {
      const timeRemaining = duration - currentTime;
      // Triggers custom 500ms fade-out when exactly 0.55s (or less) remain
      if (timeRemaining <= 0.55) {
        fadingOutRef.current = true;
        startFade(0, 500);
      }
    }
  };

  const handleEnded = () => {
    const video = videoRef.current;
    if (!video) return;

    // Force absolute 0 opacity on end
    video.style.opacity = "0";

    // 100ms reset delay, then restart playback
    setTimeout(() => {
      if (video) {
        video.currentTime = 0;
        video.play()
          .then(() => {
            fadingOutRef.current = false;
            startFade(1, 500); // 500ms fade-in
          })
          .catch((err) => {
            console.log("Play failed during loop cycle:", err);
          });
      }
    }, 100);
  };

  const handlePlay = () => {
    // If not actively fading out, fade in on load/loop start
    if (!fadingOutRef.current) {
      startFade(1, 500);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      // Force initial playback
      video.play().catch((err) => {
        console.log("Autoplay was prevented by user policy, waiting for interaction:", err);
      });
    }

    // Subscribe to Firebase Auth state updates
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });

    return () => {
      if (fadeRafRef.current) {
        cancelAnimationFrame(fadeRafRef.current);
      }
      unsubscribeAuth();
    };
  }, []);

  // Safe fallback to kick off video play if user interaction is needed
  const handlePageClick = () => {
    const video = videoRef.current;
    if (video && video.paused) {
      video.play()
        .then(() => {
          fadingOutRef.current = false;
          startFade(1, 500);
        })
        .catch(() => {});
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthError("");
    setIsAuthLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setIsAuthModalOpen(false);
    } catch (err: any) {
      console.error("Google Auth error:", err);
      const errMsg = err?.message || "";
      if (errMsg.includes("auth/popup-closed-by-user")) {
        setAuthError("Sign-in popup closed before completion.");
      } else {
        setAuthError(`Google Sign-In failed: ${err?.code || errMsg}`);
      }
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail.trim() || !authPassword) {
      setAuthError("Please fill in all fields.");
      return;
    }
    setAuthError("");
    setIsAuthLoading(true);

    try {
      if (authMode === "login") {
        await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      } else {
        await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      }
      setIsAuthModalOpen(false);
      setAuthEmail("");
      setAuthPassword("");
    } catch (err: any) {
      console.error("Auth error:", err);
      const errCode = err?.code || "";
      const errMsg = err?.message || "";
      let friendlyMessage = "Authentication failed. Please verify credentials.";

      if (errCode === "auth/email-already-in-use" || errMsg.includes("email-already-in-use")) {
        friendlyMessage = "This email is already in use. Please select 'Login' instead of 'Sign Up' if you already have an account.";
      } else if (errCode === "auth/operation-not-allowed" || errMsg.includes("operation-not-allowed")) {
        friendlyMessage = "Email/Password sign-in is currently disabled in your Firebase console. Please go to your Firebase Console under 'Build > Authentication > Sign-in method' and enable 'Email/Password'. In the meantime, you can sign in instantly using the Google entry below.";
      } else if (errCode === "auth/invalid-credential" || errMsg.includes("invalid-credential")) {
        friendlyMessage = "Incorrect email or password.";
      } else if (errCode === "auth/weak-password" || errMsg.includes("weak-password")) {
        friendlyMessage = "Password must be at least 6 characters.";
      } else if (errCode === "auth/invalid-email" || errMsg.includes("invalid-email")) {
        friendlyMessage = "Invalid email format.";
      } else {
        friendlyMessage = `Authentication failed: ${errCode || errMsg}`;
      }
      setAuthError(friendlyMessage);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrorMessage("Email address is required.");
      return;
    }
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(email.trim())) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }
    
    setErrorMessage("");
    setIsSubmitting(true);
    
    try {
      const emailValue = email.trim().toLowerCase();
      // Write the email to Firestore collection
      await addDoc(collection(db, "subscriptions"), {
        email: emailValue,
        createdAt: serverTimestamp(),
        status: "active"
      });
      
      setIsSubscribed(true);
    } catch (err) {
      console.error("Subscription failed:", err);
      setErrorMessage("Subscription failed. Please check connection or try again.");
      try {
        handleFirestoreError(err, OperationType.WRITE, "subscriptions");
      } catch (logErr) {
        // Logging completed, keep user interface friendly
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={handlePageClick}
      className={`relative min-h-screen bg-black text-white ${view === "admin" && isAdminUser ? "overflow-y-auto" : "overflow-hidden"} flex flex-col justify-between select-none`}
      id="main-viewport-container"
    >
      {/* Background Video Layer */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <video
          ref={videoRef}
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_115001_bcdaa3b4-03de-47e7-ad63-ae3e392c32d4.mp4"
          muted
          autoPlay
          playsInline
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onPlay={handlePlay}
          style={{ opacity: 0 }}
          className="absolute top-0 left-0 w-full h-full object-cover translate-y-[17%] transition-none pointer-events-none"
          id="background-looping-video"
        />
        {/* Cinematic Darkness & Vignette Overlay to ensure superb readability */}
        <div 
          className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/30 to-black pointer-events-none" 
          id="vignette-overlay" 
        />
      </div>

      {/* Navigation section */}
      <header id="navigation-section" className="relative z-20 px-6 py-6 w-full shrink-0">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="liquid-glass rounded-full px-6 py-3 flex items-center justify-between max-w-5xl mx-auto w-full"
          id="liquid-header-container"
        >
          {/* Left Side: Logo */}
          <div className="flex items-center gap-8" id="logo-links-wrapper">
            <a 
              href="#" 
              className="flex items-center gap-3 hover:opacity-85 transition-opacity select-none"
              id="navigation-logo"
            >
              <img 
                src="/Group 25.png" 
                alt="Curvalab Icon" 
                className="w-6 h-6 object-contain filter brightness-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]" 
              />
              <img 
                src="/CURVALAB.png" 
                alt="Curvalab Logotype" 
                className="h-[13px] object-contain filter brightness-110 tracking-widest" 
              />
            </a>
          </div>

          {/* Right Side: Auth buttons or User state */}
          <div className="flex items-center gap-4" id="navigation-auth-wrapper">
            {currentUser ? (
              <>
                {isAdminUser && (
                  <button
                    onClick={() => setView(view === "admin" ? "site" : "admin")}
                    className="hover:scale-105 active:scale-95 transition-all text-[10px] font-mono tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 rounded-full px-4 py-1.5 cursor-pointer uppercase font-semibold text-center select-none shrink-0"
                    id="toggle-admin-view-btn"
                  >
                    {view === "admin" ? "Exit Admin" : "Admin Panel"}
                  </button>
                )}
                <span className="text-white/60 text-xs font-mono hidden sm:inline" id="user-badge">
                  {currentUser.email || "Curator"}
                </span>
                <button 
                  onClick={async () => {
                    try {
                      await signOut(auth);
                    } catch (err) {
                      console.error("Sign out error:", err);
                    }
                  }}
                  className="liquid-glass rounded-full px-6 py-2 text-white text-sm font-medium hover:bg-white/5 active:scale-98 transition-all cursor-pointer"
                  id="logout-button"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={() => {
                    setAuthMode("signup");
                    setAuthError("");
                    setIsAuthModalOpen(true);
                  }}
                  className="text-white/80 hover:text-white transition-colors text-sm font-medium px-3 py-1 cursor-pointer"
                  id="signup-button"
                >
                  Sign Up
                </button>
                <button 
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError("");
                    setIsAuthModalOpen(true);
                  }}
                  className="liquid-glass rounded-full px-6 py-2 text-white text-sm font-medium hover:bg-white/5 active:scale-98 transition-all cursor-pointer"
                  id="login-button"
                >
                  Login
                </button>
              </>
            )}
          </div>
        </motion.div>
      </header>

       {view === "admin" && isAdminUser ? (
        <main className="relative z-10 flex-1 px-6 py-12 md:py-24 mt-12 overflow-y-auto w-full flex flex-col items-center justify-start">
          <AdminPanel 
            onBack={() => setView("site")} 
            adminEmail={currentUser?.email || ""} 
          />
        </main>
      ) : (
        <>
          {/* Main content hero area */}
          <main 
            id="hero-content-section" 
            className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12 text-center -translate-y-[20%]"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center w-full"
              id="hero-anim-wrapper"
            >
              {/* Main Display Heading */}
              <h1 
                className="font-apple-garamond text-5xl md:text-6xl lg:text-7xl text-white mb-8 tracking-tight whitespace-nowrap font-normal"
                id="hero-heading"
              >
                Built for the <span className="italic font-light text-white/95">curious</span>
              </h1>
    
              {/* Container block */}
              <div className="max-w-xl w-full space-y-4 mx-auto" id="hero-interaction-container">
                <AnimatePresence mode="wait">
                  {isSubscribed ? (
                    <motion.div
                      key="subscribe-success"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.4 }}
                      className="liquid-glass rounded-2xl p-6 w-full text-center space-y-3"
                      id="success-glass-card"
                    >
                      <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mx-auto text-black">
                        <ArrowRight className="w-5 h-5 -rotate-45" />
                      </div>
                      <h3 className="text-base font-semibold text-white tracking-tight">You are now on the list</h3>
                      <p className="text-white/60 text-xs leading-relaxed max-w-sm mx-auto">
                        We appreciate your curiosity. Keep an eye on your inbox for our periodic aesthetic and architectural letters.
                      </p>
                      <button 
                        onClick={() => setIsSubscribed(false)}
                        className="text-white/40 hover:text-white transition-colors text-xs font-medium cursor-pointer pt-1 underline underline-offset-4"
                      >
                        Subscribe with another email
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="subscribe-form-holder"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-4"
                      id="form-holder"
                    >
                      {/* Email Input Bar */}
                      <form onSubmit={handleSubscribe} className="w-full flex flex-col gap-2" id="subscription-form">
                        <div className="liquid-glass rounded-full pl-6 pr-2 py-2 flex items-center gap-3 w-full">
                          <input 
                            type="email"
                            value={email}
                            onChange={(e) => {
                              setEmail(e.target.value);
                              if (errorMessage) setErrorMessage("");
                            }}
                            placeholder="Enter your email"
                            className="bg-transparent text-white placeholder:text-white/40 text-base outline-none flex-1 border-none focus:ring-0"
                            aria-label="Email Address"
                            id="email-input-field"
                          />
                          <button 
                            type="submit"
                            disabled={isSubmitting}
                            className="bg-white rounded-full p-3 text-black hover:bg-white/90 active:scale-95 transition-all cursor-pointer flex items-center justify-center shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                            aria-label="Submit subscription"
                            id="email-submit-button"
                          >
                            {isSubmitting ? (
                              <Loader2 className="w-5 h-5 text-black animate-spin" />
                            ) : (
                              <ArrowRight className="w-5 h-5 text-black" />
                            )}
                          </button>
                        </div>
    
                        {errorMessage && (
                          <span className="text-red-400 text-xs text-left pl-6" id="input-validation-msg">
                            {errorMessage}
                          </span>
                        )}
                      </form>
    
                      {/* Subtitle text */}
                      <p className="text-white text-sm leading-relaxed px-4 opacity-70" id="hero-subtitle">
                        Stay updated with the latest news and insights. Subscribe to our newsletter today and never miss out on exciting updates.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
    
                {/* Interactive Manifesto toggle and display */}
                <div className="pt-2 flex flex-col items-center gap-4" id="manifesto-wrapper">
                  <button 
                    type="button"
                    onClick={() => setShowManifesto(!showManifesto)}
                    className="liquid-glass rounded-full px-8 py-3 text-white text-sm font-medium hover:bg-white/5 active:scale-98 transition-all cursor-pointer"
                    id="manifesto-toggle-button"
                  >
                    {showManifesto ? "Hide Manifesto" : "Read Manifesto"}
                  </button>
    
                  <AnimatePresence>
                    {showManifesto && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden w-full max-w-md mx-auto"
                        id="manifesto-accordion"
                      >
                        <div className="liquid-glass rounded-2xl p-6 text-left space-y-3 mt-2" id="manifesto-body">
                          <h4 className="text-white text-sm font-semibold tracking-wide uppercase font-mono text-white/90">
                            The Curvalab Creed
                          </h4>
                          <p className="text-white/70 text-xs leading-relaxed">
                            We reject the transactional noise of the modern web. We believe in design as a primary form of human expression—tactile, cinematic, and uncompromised.
                          </p>
                          <p className="text-white/70 text-xs leading-relaxed">
                            This digital canvas belongs to the curious. A resting space for eyes accustomed to the glare of default configurations. Welcome to asymmetry.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </main>
    
          {/* Social Icons Footer */}
          <footer id="footer-section" className="relative z-10 flex justify-center gap-4 pb-12 shrink-0">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="flex justify-center gap-4"
              id="footer-inner-holder"
            >
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="liquid-glass rounded-full p-4 text-white/80 hover:text-white hover:bg-white/5 hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                aria-label="Instagram Page"
                id="instagram-social"
              >
                <Instagram className="w-5 h-5" />
              </a>
    
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="liquid-glass rounded-full p-4 text-white/80 hover:text-white hover:bg-white/5 hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                aria-label="Twitter Page"
                id="twitter-social"
              >
                <Twitter className="w-5 h-5" />
              </a>
    
              <a
                href="https://manibajwa.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
                className="liquid-glass rounded-full p-4 text-white/80 hover:text-white hover:bg-white/5 hover:scale-105 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
                aria-label="Mani Bajwa Website"
                id="globe-social"
              >
                <Globe className="w-5 h-5" />
              </a>
            </motion.div>
          </footer>
        </>
      )}

      {/* High-fidelity Liquid Glass Auth Modal */}
      <AnimatePresence>
        {isAuthModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-md"
            onClick={() => setIsAuthModalOpen(false)}
            id="auth-modal-backdrop"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.5, bounce: 0.15 }}
              className="liquid-glass w-full max-w-sm rounded-[2rem] p-8 space-y-6 text-left"
              onClick={(e) => e.stopPropagation()}
              id="auth-modal-card"
            >
              <div className="space-y-2 text-center">
                <img 
                  src="/Group 25.png" 
                  alt="Curvalab Icon" 
                  className="w-10 h-10 object-contain filter brightness-110 drop-shadow-[0_0_12px_rgba(255,255,255,0.4)] mx-auto mb-2" 
                />
                <h3 className="text-xl font-normal tracking-tight text-white font-sans">
                  {authMode === "login" ? "Welcome back" : "Begin your journey"}
                </h3>
                <p className="text-white/60 text-xs">
                  {authMode === "login" ? "Sign in to access your Curvalab profile" : "Create your credentials for secure access"}
                </p>
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-4" id="auth-form-fields">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-widest text-white/50 font-mono ml-4">Email</label>
                  <div className="liquid-glass rounded-full px-5 py-2.5 flex items-center">
                    <input 
                      type="email"
                      required
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="bg-transparent text-white placeholder:text-white/30 text-sm outline-none flex-1 border-none focus:ring-0"
                      id="auth-email-input"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-widest text-white/50 font-mono ml-4">Password</label>
                  <div className="liquid-glass rounded-full px-5 py-2.5 flex items-center">
                    <input 
                      type="password"
                      required
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="••••••••"
                      className="bg-transparent text-white placeholder:text-white/30 text-sm outline-none flex-1 border-none focus:ring-0"
                      id="auth-password-input"
                    />
                  </div>
                </div>

                {authError && (
                  <p className="text-red-400 text-xs text-center px-2 leading-relaxed whitespace-pre-line" id="auth-error-display">
                    {authError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isAuthLoading}
                  className="w-full bg-white text-black font-medium text-sm py-3 rounded-full hover:bg-white/90 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  id="auth-submit-button"
                >
                  {isAuthLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                  ) : authMode === "login" ? (
                    "Login"
                  ) : (
                    "Register"
                  )}
                </button>
              </form>

              <div className="flex items-center my-4 text-white/20 select-none">
                <div className="flex-1 h-px bg-current"></div>
                <span className="px-3 text-[10px] uppercase tracking-widest font-mono text-white/40">or</span>
                <div className="flex-1 h-px bg-current"></div>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isAuthLoading}
                className="w-full bg-white/5 hover:bg-white/10 text-white font-medium text-sm py-3 rounded-full active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer border border-white/10 disabled:opacity-60 disabled:cursor-not-allowed select-none"
                id="auth-google-button"
              >
                <svg className="w-4 h-4 fill-current mr-1" viewBox="0 0 24 24">
                  <path d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.71 0 3.28.62 4.49 1.643l2.42-2.42C17.435 1.77 14.97 1 12.24 1 6.58 1 2 5.58 2 11.24s4.58 10.24 10.24 10.24c5.9 0 10.24-4.14 10.24-10.24 0-.69-.06-1.35-.18-1.955H12.24z"/>
                </svg>
                Continue with Google
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode(authMode === "login" ? "signup" : "login");
                    setAuthError("");
                  }}
                  className="text-white/50 hover:text-white text-xs transition-colors cursor-pointer"
                  id="auth-mode-switch"
                >
                  {authMode === "login" ? "Don't have an account? Sign Up" : "Already registered? Login"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
