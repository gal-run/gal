import { Github, Loader2, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";
import { startGitHubAuth, acceptTerms } from "../lib/api";
import { captureExceptionWithTags } from "../lib/sentry";
import { GAL_TERMS_URL, GAL_PRIVACY_URL } from "@gal/types";

interface LoginViewProps {
 onLoginSuccess: () => void;
}

export function LoginView({ onLoginSuccess }: LoginViewProps) {
 const [isLoading, setIsLoading] = useState(false);
 const [authStarted, setAuthStarted] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [termsAccepted, setTermsAccepted] = useState(false);

 // Listen for auth completion via storage changes.
 // This fires when:
 // (a) The popup stayed open and the service worker wrote galAuthComplete=true
 // (b) The popup was reopened after auth completed — handled by App.tsx's
 // restoreFromCacheAndRevalidate which reads authToken from storage.
 useEffect(() => {
 const onStorageChanged = (changes: { [key: string]: chrome.storage.StorageChange },
 area: string,) => {
 if (area !== "local") return;

 if (changes.galAuthComplete?.newValue === true) {
 // Auth completed while popup was open — notify parent
 setIsLoading(false);
 onLoginSuccess();
 }

 if (changes.galAuthError?.newValue) {
 setIsLoading(false);
 const errorMessage = changes.galAuthError.newValue as string;
 setError(errorMessage);
 captureExceptionWithTags(new Error(errorMessage), {
 extension_id: chrome.runtime.id,
 error_message: errorMessage,
 auth_source: "storage_listener",
 });
 }
 };

 chrome.storage.onChanged.addListener(onStorageChanged);
 return () => {
 chrome.storage.onChanged.removeListener(onStorageChanged);
 };
 }, [onLoginSuccess]);

 const handleLogin = async () => {
 setIsLoading(true);
 setAuthStarted(true);
 setError(null);

 try {
 const result = await startGitHubAuth();
 if (result.success) {
 await acceptTerms('1.0');
 onLoginSuccess();
 } else {
 const errorMessage = result.error || "Login failed";
 setError(errorMessage);
 captureExceptionWithTags(new Error(errorMessage), {
 extension_id: chrome.runtime.id,
 error_message: errorMessage,
 auth_source: "login_handler_failure",
 });
 }
 } catch (err) {
 const errorMessage = err instanceof Error ? err.message : "Login failed";
 setError(errorMessage);
 captureExceptionWithTags(err instanceof Error ? err : new Error(errorMessage),
 {
 extension_id: chrome.runtime.id,
 error_message: errorMessage,
 auth_source: "login_handler",
 },);
 } finally {
 setIsLoading(false);
 setAuthStarted(false);
 }
 };

 return (<div className="flex flex-col items-center justify-center min-h-[400px] p-6">
 <div className="text-center space-y-4">
 <div className="w-16 h-16 mx-auto flex items-center justify-center">
 <svg viewBox="0 0 36 36" className="w-10 h-10" fill="none">
 <rect width="36" height="36" rx="8" fill="black" />
 <path d="M8 12L18 6L28 12V18L18 12L8 18V12Z" fill="#00FF2A" />
 <path d="M8 18L18 12L28 18V24L18 18L8 24V18Z" fill="#00FF2A" fillOpacity="0.6" />
 <path d="M8 24L18 18L28 24V30L18 24L8 30V24Z" fill="#00FF2A" fillOpacity="0.3" />
 </svg>
 </div>

 <div>
 <h1 className="text-xl font-bold text-white mb-2">Welcome to GAL</h1>
 <p className="text-sm text-gray-400">
 Access your organization's approved AI agent workflows
 </p>
 </div>

 {error && (<div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
 <p className="text-sm text-red-400">{error}</p>
 </div>)}

 <label className="flex items-start gap-2 cursor-pointer text-xs text-gray-400">
 <input
 type="checkbox"
 checked={termsAccepted}
 onChange={(e) => setTermsAccepted(e.target.checked)}
 className="mt-0.5 accent-gal-accent"
 />
 <span>
 I agree to GAL's{' '}
 <a href={GAL_TERMS_URL} target="_blank" rel="noopener noreferrer" className="underline">terms</a>
 {' '}and{' '}
 <a href={GAL_PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="underline">privacy policy</a>
 </span>
 </label>

 <button
 onClick={handleLogin}
 disabled={isLoading || !termsAccepted}
 className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
 title={!termsAccepted ? "Please accept the terms above to continue" : ""}
 >
 {isLoading ? (<>
 <Loader2 className="w-5 h-5 animate-spin" />
 <span>{authStarted ? "Complete sign-in in the browser window..." : "Connecting..."}</span>
 {authStarted && <ExternalLink className="w-4 h-4 ml-1 opacity-60" />}
 </>) : (<>
 <Github className="w-5 h-5" />
 <span>Sign in with GitHub</span>
 </>)}
 </button>

 {!termsAccepted && !isLoading && (<p className="text-xs text-gray-500 text-center">
 Please accept the terms above to sign in
 </p>)}
 </div>
 </div>);
}
