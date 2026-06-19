import { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { captureException } from "../lib/sentry";

interface Props {
 children: ReactNode;
 fallback?: ReactNode;
}

interface State {
 hasError: boolean;
 error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
 constructor(props: Props) {
 super(props);
 this.state = { hasError: false, error: null };
 }

 static getDerivedStateFromError(error: Error): State {
 return { hasError: true, error };
 }

 componentDidCatch(error: Error, errorInfo: ErrorInfo) {
 console.error("ErrorBoundary caught an error:", error, errorInfo);
 captureException(error);
 }

 handleRetry = () => {
 this.setState({ hasError: false, error: null });
 };

 render() {
 if (this.state.hasError) {
 if (this.props.fallback) {
 return this.props.fallback;
 }

 return (<div className="p-6 flex flex-col items-center justify-center h-full">
 <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
 <AlertCircle className="w-6 h-6 text-red-500" />
 </div>
 <h2 className="text-lg font-semibold text-white mb-2">
 Something went wrong
 </h2>
 <p className="text-sm text-gray-400 text-center mb-4">
 {this.state.error?.message || "An unexpected error occurred"}
 </p>
 <button
 onClick={this.handleRetry}
 className="flex items-center gap-2 px-4 py-2 bg-gal-accent/10 text-gal-accent rounded-lg hover:bg-gal-accent/20 transition-colors"
 >
 <RefreshCw className="w-4 h-4" />
 Try Again
 </button>
 </div>);
 }

 return this.props.children;
 }
}
