import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Folder,
    File,
    ChevronRight,
    ArrowUp,
    HardDrive,
    Loader2,
    X,
    Check,
    Home
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FileEntry {
    name: string;
    path: string;
    isDirectory: boolean;
    isDrive?: boolean;
    isSymlink?: boolean;
}

interface ServerFileBrowserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (path: string) => void;
    initialPath?: string;
}

export default function ServerFileBrowserModal({
    isOpen,
    onClose,
    onSelect,
    initialPath = ""
}: ServerFileBrowserModalProps) {
    const [currentPath, setCurrentPath] = useState(initialPath);
    const [items, setItems] = useState<FileEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedItem, setSelectedItem] = useState<FileEntry | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchItems(currentPath);
        }
    }, [isOpen, currentPath]);

    const fetchItems = async (path: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/utils/fs?path=${encodeURIComponent(path)}`);
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Failed to load directory');

            setItems(data.items || []);
            // Update current path if returned normalized from server
            if (data.currentPath !== undefined) {
                // simple normalization check?
            }
        } catch (err: any) {
            setError(err.message);
            // If path failed, maybe reset to root if it was invalid?
            // But let's show error instead so user knows.
        } finally {
            setLoading(false);
        }
    };

    const handleNavigate = (path: string) => {
        setCurrentPath(path);
        setSelectedItem(null);
    };

    const handleUp = () => {
        if (!currentPath || currentPath === '/' || /^[A-Z]:\\?$/.test(currentPath)) {
            setCurrentPath(""); // Reset to drives view
            return;
        }

        // Simple string manipulation for parent path
        // Handles both forward and back slashes
        const separator = currentPath.includes('\\') ? '\\' : '/';
        const parts = currentPath.split(separator).filter(Boolean);
        parts.pop();

        if (parts.length === 0) {
            // If it was effectively top level, go to root/drives
            // On Windows: D:/ -> D: -> empty?
            if (currentPath.includes(':')) {
                setCurrentPath(""); // Windows root
            } else {
                setCurrentPath("/"); // Unix root
            }
        } else {
            // Reconstruct logic needs care for Windows drives vs Unix root
            if (currentPath.includes(':')) {
                // Windows: "C", "Users" -> "C:\Users"
                // Note: parts[0] is "C:"
                setCurrentPath(parts.join('\\') + (parts.length === 1 ? '\\' : ''));
            } else {
                setCurrentPath('/' + parts.join('/'));
            }
        }
    };

    const handleConfirm = () => {
        if (selectedItem) {
            onSelect(selectedItem.path);
        } else if (currentPath) {
            // Allow selecting the current folder itself
            onSelect(currentPath);
        }
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-4xl bg-[#0F172A] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-white/10 bg-white/5 flex items-center gap-4">
                            <h2 className="font-semibold text-lg flex items-center gap-2">
                                <Folder className="w-5 h-5 text-primary" />
                                Browse Server Files
                            </h2>
                            <div className="flex-1 bg-black/40 border border-white/10 rounded px-3 py-1.5 text-sm font-mono text-muted-foreground flex items-center gap-2 overflow-hidden whitespace-nowrap">
                                <span className="text-primary/50 shrink-0">PATH:</span>
                                <span className="text-white truncate" title={currentPath || "Root"}>
                                    {currentPath || "My Computer"}
                                </span>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Toolbar */}
                        <div className="p-2 border-b border-white/10 flex items-center gap-2 bg-black/20">
                            <button
                                onClick={handleUp}
                                disabled={!currentPath}
                                className="p-2 hover:bg-white/10 rounded-md disabled:opacity-30 disabled:hover:bg-transparent"
                                title="Go Up"
                            >
                                <ArrowUp className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setCurrentPath(initialPath || "")}
                                className="p-2 hover:bg-white/10 rounded-md"
                                title="Go Home"
                            >
                                <Home className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => fetchItems(currentPath)}
                                className="p-2 hover:bg-white/10 rounded-md"
                                title="Refresh"
                            >
                                <Loader2 className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-4 min-h-[400px]">
                            {loading && items.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                                    <Loader2 className="w-8 h-8 animate-spin" />
                                    <p>Loading contents...</p>
                                </div>
                            ) : error ? (
                                <div className="flex flex-col items-center justify-center h-full text-red-400 gap-2">
                                    <div className="p-3 bg-red-500/10 rounded-full">
                                        <X className="w-6 h-6" />
                                    </div>
                                    <p>{error}</p>
                                    <button
                                        onClick={handleUp}
                                        className="text-sm underline hover:text-red-300"
                                    >
                                        Go Back / Up
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {/* Parent Dir Entry (optional in grid, usually handled by Up button) */}

                                    {items.map((item, idx) => (
                                        <div
                                            key={`${item.path}-${idx}`}
                                            onClick={() => setSelectedItem(item)}
                                            onDoubleClick={() => item.isDirectory && handleNavigate(item.path)}
                                            className={cn(
                                                "group flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                                                selectedItem?.path === item.path
                                                    ? "bg-primary/20 border-primary"
                                                    : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10"
                                            )}
                                        >
                                            <div className={cn(
                                                "p-2 rounded-lg",
                                                item.isDirectory
                                                    ? (selectedItem?.path === item.path ? "bg-primary/20 text-primary" : "bg-blue-500/10 text-blue-400")
                                                    : "bg-slate-500/10 text-slate-400"
                                            )}>
                                                {item.isDrive ? <HardDrive className="w-5 h-5" /> :
                                                    item.isDirectory ? <Folder className="w-5 h-5" /> :
                                                        <File className="w-5 h-5" />}
                                            </div>
                                            <div className="flex-1 min-w-0 text-left">
                                                <div className="font-medium text-sm truncate text-white/90 group-hover:text-white">
                                                    {item.name || item.path}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground truncate">
                                                    {item.isDirectory ? 'Directory' : 'File'}
                                                </div>
                                            </div>
                                            {item.isDirectory && (
                                                <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/50" />
                                            )}
                                        </div>
                                    ))}

                                    {items.length === 0 && !loading && (
                                        <div className="col-span-full py-12 text-center text-muted-foreground">
                                            Empty Directory
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-white/10 bg-white/5 flex items-center justify-between gap-4">
                            <div className="text-sm text-muted-foreground truncate max-w-md">
                                {selectedItem
                                    ? `Selected: ${selectedItem.name}`
                                    : currentPath ? `Current Location: ${currentPath}` : 'Select a folder'}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={onClose}
                                    className="px-4 py-2 hover:bg-white/10 text-white/80 rounded-lg transition-colors text-sm font-medium"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    disabled={!selectedItem && !currentPath}
                                    className="px-6 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors text-sm font-bold flex items-center gap-2 shadow-lg shadow-primary/20"
                                >
                                    <Check className="w-4 h-4" />
                                    Select {selectedItem?.isDirectory ? 'Folder' : 'Current Path'}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
