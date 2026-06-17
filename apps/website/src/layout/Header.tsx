import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { FEATURE_FLAGS, DASHBOARD_URL } from "@/src/config";

export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  const navLinks = [
    { href: "#how-it-works", label: "HOW IT WORKS" },
    { href: "#features", label: "FEATURES" },
    ...(FEATURE_FLAGS.showPricing
      ? [{ href: "#pricing", label: "PRICING" }]
      : []),
    { href: "/vision", label: "VISION" },
    { href: "/docs", label: "DOCS" },
    { href: "/blog", label: "BLOG" },
  ];

  const resolveHref = (href: string) =>
    href.startsWith("#") && pathname !== "/" ? `/${href}` : href;

  const isActiveLink = (href: string) => {
    if (href === "/vision") return pathname === "/vision";
    if (href === "/docs") return pathname.startsWith("/docs");
    if (href === "/blog") return pathname.startsWith("/blog");
    return false;
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center gap-3 group">
          {/* Angular geometric layers with black background */}
          <svg viewBox="0 0 36 36" className="w-10 h-10" fill="none">
            <rect width="36" height="36" rx="8" fill="black" />
            <path d="M8 12L18 6L28 12V18L18 12L8 18V12Z" fill="#00FF2A" />
            <path
              d="M8 18L18 12L28 18V24L18 18L8 24V18Z"
              fill="#00FF2A"
              fillOpacity="0.6"
            />
            <path
              d="M8 24L18 18L28 24V30L18 24L8 30V24Z"
              fill="#00FF2A"
              fillOpacity="0.3"
            />
          </svg>
          {/* Text */}
          <span className="text-4xl font-black tracking-tight text-gray-900">
            gal<span className="text-[#00FF2A]">.</span>run
          </span>
        </a>

        {/* Right side - Navigation + Actions */}
        <div className="flex items-center gap-6">
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={resolveHref(link.href)}
                className={`text-sm font-medium transition-colors tracking-wide leading-none ${
                  isActiveLink(link.href)
                    ? "text-gray-900"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <a
            href={`${DASHBOARD_URL}/login`}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors hidden sm:block leading-none"
          >
            LOGIN
          </a>
          <a
            href={`${DASHBOARD_URL}/login`}
            className="hidden sm:flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-full hover:bg-gray-800 transition-colors"
          >
            GET STARTED
            <ArrowRight className="w-4 h-4" />
          </a>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
            aria-label="Toggle mobile menu"
          >
            <div className="w-5 h-4 flex flex-col justify-between">
              <span
                className={`block h-0.5 bg-gray-900 transition-transform duration-300 ${isMobileMenuOpen ? "rotate-45 translate-y-1.5" : ""}`}
              />
              <span
                className={`block h-0.5 bg-gray-900 transition-opacity duration-300 ${isMobileMenuOpen ? "opacity-0" : ""}`}
              />
              <span
                className={`block h-0.5 bg-gray-900 transition-transform duration-300 ${isMobileMenuOpen ? "-rotate-45 -translate-y-1.5" : ""}`}
              />
            </div>
          </button>
        </div>
      </nav>

      {/* Mobile Menu Dropdown */}
      <motion.div
        initial={false}
        animate={{
          height: isMobileMenuOpen ? "auto" : 0,
          opacity: isMobileMenuOpen ? 1 : 0,
        }}
        transition={{ duration: 0.3 }}
        className="md:hidden overflow-hidden bg-white border-b border-gray-100"
      >
        <div className="px-4 py-4 space-y-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={resolveHref(link.href)}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`block py-3 px-4 rounded-lg transition-colors text-sm font-medium ${
                isActiveLink(link.href)
                  ? "bg-gray-100 text-gray-900"
                  : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <a
            href={`${DASHBOARD_URL}/login`}
            onClick={() => setIsMobileMenuOpen(false)}
            className="block py-3 px-4 text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors text-sm font-medium"
          >
            LOGIN
          </a>
          <a
            href={`${DASHBOARD_URL}/login`}
            onClick={() => setIsMobileMenuOpen(false)}
            className="flex items-center justify-center gap-2 w-full mt-3 py-3 px-4 bg-gray-900 text-white font-medium rounded-full text-sm"
          >
            GET STARTED
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </motion.div>
    </header>
  );
}
