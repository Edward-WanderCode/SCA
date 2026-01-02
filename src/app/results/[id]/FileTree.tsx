import React, { useState } from 'react';
import {
    ChevronRight,
    ChevronDown,
    Folder,
    FolderOpen,
    FileText,
    FileCode,
    File
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FileNode {
    name: string;
    path: string;
    type: 'file' | 'directory';
    children?: FileNode[];
    size?: number;
}

interface FileTreeProps {
    data: FileNode[];
    onSelectFile?: (path: string) => void;
    selectedFile?: string | null;
    className?: string;
}

const FileTreeNode = ({
    node,
    level,
    onSelect,
    selectedPath
}: {
    node: FileNode;
    level: number;
    onSelect?: (path: string) => void;
    selectedPath?: string | null;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const isSelected = selectedPath === node.path;

    // Auto-expand if a child is selected (simplified: initially just collapse)
    // For specialized auto-expand logic, we'd need to check children recursively.

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (node.type === 'directory') {
            setIsOpen(!isOpen);
        } else {
            onSelect?.(node.path);
        }
    };

    const getIcon = () => {
        if (node.type === 'directory') {
            return isOpen ? <FolderOpen className="w-4 h-4 text-indigo-400" /> : <Folder className="w-4 h-4 text-indigo-400" />;
        }
        if (node.name.match(/\.(ts|tsx|js|jsx)$/)) return <FileCode className="w-4 h-4 text-blue-400" />;
        if (node.name.match(/\.(css|scss|less)$/)) return <FileCode className="w-4 h-4 text-sky-300" />;
        if (node.name.match(/\.(json|yml|yaml|xml)$/)) return <FileText className="w-4 h-4 text-yellow-400" />;
        return <File className="w-4 h-4 text-slate-500" />;
    };

    return (
        <div>
            <div
                className={cn(
                    "flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer transition-colors text-sm select-none",
                    level > 0 && "ml-4",
                    isSelected ? "bg-indigo-600/20 text-indigo-200" : "hover:bg-white/5 text-slate-300"
                )}
                onClick={handleClick}
            >
                {node.type === 'directory' && (
                    <span className="text-slate-500">
                        {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </span>
                )}
                {node.type === 'file' && <span className="w-3" />} {/* Spacer */}
                {getIcon()}
                <span className="truncate">{node.name}</span>
            </div>
            {isOpen && node.children && (
                <div className="border-l border-white/5 ml-3">
                    {node.children.map((child, i) => (
                        <FileTreeNode
                            key={`${child.path}-${i}`}
                            node={child}
                            level={level + 1}
                            onSelect={onSelect}
                            selectedPath={selectedPath}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default function FileTree({ data, onSelectFile, selectedFile, className }: FileTreeProps) {
    if (!data || data.length === 0) {
        return (
            <div className={cn("p-4 text-center text-muted-foreground text-sm", className)}>
                No files available
            </div>
        );
    }

    return (
        <div className={cn("overflow-hidden flex flex-col h-full", className)}>
            <div className="p-3 border-b border-white/10 bg-white/5">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Folder className="w-4 h-4" />
                    Source Browser
                </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                {data.map((node, i) => (
                    <FileTreeNode
                        key={`${node.path}-${i}`}
                        node={node}
                        level={0}
                        onSelect={onSelectFile}
                        selectedPath={selectedFile}
                    />
                ))}
            </div>
        </div>
    );
}
