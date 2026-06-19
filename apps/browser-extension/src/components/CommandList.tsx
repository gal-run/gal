import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { CommandCard } from "./CommandCard";
import type { Command } from "../lib/api";

interface CommandListProps {
  commands: Command[];
  onCopy?: (command: Command) => void;
}

export function CommandList({ commands, onCopy }: CommandListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredCommands = useMemo(() => {
    if (!searchQuery.trim()) return commands;

    const query = searchQuery.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(query) ||
        cmd.description?.toLowerCase().includes(query) ||
        cmd.tags?.some((tag) => tag.toLowerCase().includes(query)),
    );
  }, [commands, searchQuery]);

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search workflows..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-gray-800/50 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gal-accent/50"
        />
      </div>

      {/* Commands */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
        {filteredCommands.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchQuery
              ? "No workflows match your search"
              : "No workflows available"}
          </div>
        ) : (
          filteredCommands.map((command) => (
            <CommandCard key={command.id} command={command} onCopy={onCopy} />
          ))
        )}
      </div>
    </div>
  );
}
