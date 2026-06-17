import { useState, useRef, useEffect } from "react";
import { Building2, User, ChevronDown, Check } from "lucide-react";
import type { Organization } from "../lib/api";

interface WorkspaceSwitcherProps {
 organizations: Organization[];
 selectedOrg: string | null;
 onSelectOrg: (orgName: string) => void;
}

/**
 * Workspace switcher dropdown for the Chrome extension popup.
 * Modeled after the Dashboard WorkspaceSwitcher component.
 */
export function WorkspaceSwitcher({
 organizations,
 selectedOrg,
 onSelectOrg,
}: WorkspaceSwitcherProps) {
 const [isOpen, setIsOpen] = useState(false);
 const dropdownRef = useRef<HTMLDivElement>(null);

 // Close dropdown when clicking outside
 useEffect(() => {
 const handleClickOutside = (event: MouseEvent) => {
 if (dropdownRef.current &&
 !dropdownRef.current.contains(event.target as Node)) {
 setIsOpen(false);
 }
 };
 document.addEventListener("mousedown", handleClickOutside);
 return () => document.removeEventListener("mousedown", handleClickOutside);
 }, []);

 // Close dropdown on escape key
 useEffect(() => {
 const handleEscape = (e: KeyboardEvent) => {
 if (e.key === "Escape") setIsOpen(false);
 };
 document.addEventListener("keydown", handleEscape);
 return () => document.removeEventListener("keydown", handleEscape);
 }, []);

 if (organizations.length === 0) {
 return (<div className="px-1 py-1">
 <div className="px-3 py-2 text-xs text-gray-500">
 No workspaces connected
 </div>
 </div>);
 }

 const currentAccount = organizations.find((a) => a.name === selectedOrg);
 const displayName = currentAccount?.name || "Select Workspace";
 const isPersonalAccount = currentAccount?.accountType === "User";
 const Icon = isPersonalAccount ? User : Building2;

 const handleSelectAccount = (orgName: string) => {
 onSelectOrg(orgName);
 setIsOpen(false);
 };

 return (<div ref={dropdownRef} className="relative">
 {/* Trigger Button */}
 <button
 onClick={() => setIsOpen(!isOpen)}
 className="w-full flex items-center gap-2 px-3 py-2 rounded-lg
 hover:bg-gray-800 border border-gray-700 hover:border-gray-600
 transition-all duration-200 group"
 >
 <Icon className="w-4 h-4 text-gal-accent flex-shrink-0" />
 <span className="flex-1 text-left text-sm text-white truncate font-medium">
 {displayName}
 </span>
 <ChevronDown
 className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 ${
 isOpen ? "rotate-180" : ""
 }`}
 />
 </button>

 {/* Dropdown Menu */}
 {isOpen && (<div className="absolute left-0 right-0 mt-1 z-50 rounded-lg overflow-hidden border border-gray-700 bg-gray-800 shadow-lg">
 <div className="py-1 px-1">
 {organizations.map((account) => {
 const isPersonal = account.accountType === "User";
 const AccountIcon = isPersonal ? User : Building2;
 const isSelected = account.name === selectedOrg;

 return (<button
 key={account.name}
 onClick={() => handleSelectAccount(account.name)}
 className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left rounded-md
 transition-all duration-150 ${
 isSelected
 ? "bg-gal-accent/10"
 : "hover:bg-gray-700/50"
 }`}
 >
 <AccountIcon
 className={`w-4 h-4 flex-shrink-0 ${
 isSelected ? "text-gal-accent" : "text-gray-500"
 }`}
 />
 <div className="flex-1 min-w-0">
 <span
 className={`text-sm font-medium block truncate ${
 isSelected ? "text-white" : "text-gray-300"
 }`}
 >
 {account.name}
 </span>
 <span className="text-[10px] text-gray-500">
 {isPersonal
 ? "Personal account"
 : "GitHub organization"}
 </span>
 </div>
 {isSelected && (<Check className="w-4 h-4 text-gal-accent flex-shrink-0" />)}
 </button>);
 })}
 </div>
 </div>)}
 </div>);
}
