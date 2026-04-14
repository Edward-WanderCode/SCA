'use client';

import { useState, useEffect } from 'react';
import {
    Settings,
    Send,
    CheckCircle,
    XCircle,
    Loader2,
    Bot,
    Cog,
    Terminal,
    Copy,
    Check,
    Eye,
    EyeOff,
    ToggleLeft,
    ToggleRight,
    RefreshCw,
    Zap,
    Shield,
    MessageSquare,
    Info,
    Save,
    Trash2,
    FolderSearch,
    ListRestart,
    HelpCircle,
    FileText,
    GitBranch
} from 'lucide-react';

interface TelegramConfig {
    botToken: string;
    chatId: string;
    enabled: boolean;
    hasToken?: boolean;
}

type TabId = 'settings' | 'commands';

interface BotCommand {
    command: string;
    description: string;
    usage: string;
    example?: string;
    icon: React.ReactNode;
    category: 'general' | 'scan' | 'manage';
    notes?: string;
}

const BOT_COMMANDS: BotCommand[] = [
    {
        command: '/start',
        description: 'Khởi động bot và hiển thị menu chào mừng',
        usage: '/start',
        icon: <Zap className="w-4 h-4" />,
        category: 'general',
    },
    {
        command: '/help',
        description: 'Hiển thị danh sách tất cả lệnh và hướng dẫn sử dụng',
        usage: '/help',
        icon: <HelpCircle className="w-4 h-4" />,
        category: 'general',
    },
    {
        command: '/scan',
        description: 'Bắt đầu quét bảo mật mã nguồn từ Git repository',
        usage: '/scan <repository_url>',
        example: '/scan https://github.com/user/repo.git',
        icon: <Shield className="w-4 h-4" />,
        category: 'scan',
        notes: 'Chỉ hỗ trợ URL dạng HTTPS hoặc git@. Bot sẽ tự động clone, quét và gửi kết quả PDF.',
    },
    {
        command: '/listscan',
        description: 'Hiển thị 10 lịch sử quét gần nhất với nút bấm tương tác',
        usage: '/listscan',
        icon: <FileText className="w-4 h-4" />,
        category: 'scan',
    },
    {
        command: '/status',
        description: 'Theo dõi tiến trình quét đang chạy hoặc xem kết quả',
        usage: '/status [scan_id]',
        example: '/status scan_abc123',
        icon: <FolderSearch className="w-4 h-4" />,
        category: 'scan',
        notes: 'Nếu dùng trong topic dự án, không cần cung cấp scan_id — bot tự nhận diện.',
    },
    {
        command: '/rescan',
        description: 'Quét lại project và so sánh với lần quét trước',
        usage: '/rescan [scan_id]',
        example: '/rescan scan_abc123',
        icon: <ListRestart className="w-4 h-4" />,
        category: 'manage',
        notes: 'Chỉ hoạt động với scan từ Git. Nếu dùng trong topic dự án, scan_id là tùy chọn.',
    },
    {
        command: '/delete',
        description: 'Xóa một lần quét và topic Telegram liên quan',
        usage: '/delete [scan_id]',
        example: '/delete scan_abc123',
        icon: <Trash2 className="w-4 h-4" />,
        category: 'manage',
        notes: 'Xóa vĩnh viễn dữ liệu quét và topic trong group. Không thể hoàn tác!',
    },
];

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
    general: { label: 'Chung', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    scan: { label: 'Quét & Phân tích', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    manage: { label: 'Quản lý', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
};

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState<TabId>('settings');
    const [config, setConfig] = useState<TelegramConfig>({
        botToken: '',
        chatId: '',
        enabled: false,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [showToken, setShowToken] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [originalConfig, setOriginalConfig] = useState<TelegramConfig | null>(null);

    useEffect(() => {
        loadConfig();
    }, []);

    // Track unsaved changes
    useEffect(() => {
        if (originalConfig) {
            const changed =
                config.botToken !== originalConfig.botToken ||
                config.chatId !== originalConfig.chatId ||
                config.enabled !== originalConfig.enabled;
            setHasUnsavedChanges(changed);
        }
    }, [config, originalConfig]);

    const loadConfig = async () => {
        try {
            const response = await fetch('/api/telegram');
            const data = await response.json();
            setConfig(data);
            setOriginalConfig(data);
        } catch (error) {
            console.error('Failed to load config:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);

        try {
            const response = await fetch('/api/telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });

            if (!response.ok) {
                throw new Error('Failed to save configuration');
            }

            setMessage({ type: 'success', text: 'Cấu hình đã được lưu thành công!' });
            setOriginalConfig({ ...config });
            setHasUnsavedChanges(false);
        } catch (error) {
            setMessage({
                type: 'error',
                text: error instanceof Error ? error.message : 'Lưu cấu hình thất bại',
            });
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        setMessage(null);

        try {
            const response = await fetch('/api/telegram', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    botToken: config.botToken,
                    chatId: config.chatId,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Connection test failed');
            }

            setMessage({ type: 'success', text: 'Kết nối thành công! Kiểm tra chat Telegram của bạn.' });
        } catch (error) {
            setMessage({
                type: 'error',
                text: error instanceof Error ? error.message : 'Kiểm tra kết nối thất bại',
            });
        } finally {
            setTesting(false);
        }
    };

    const handleCopyCommand = (cmd: string) => {
        navigator.clipboard.writeText(cmd);
        setCopiedCmd(cmd);
        setTimeout(() => setCopiedCmd(null), 2000);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-3 bg-blue-500/10 rounded-xl backdrop-blur-sm border border-blue-500/20">
                        <Bot className="w-7 h-7 text-blue-400" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Telegram Bot</h1>
                        <p className="text-muted-foreground mt-0.5">Quản lý cấu hình và xem danh sách lệnh bot</p>
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/5">
                <button
                    onClick={() => setActiveTab('settings')}
                    className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-all ${
                        activeTab === 'settings'
                            ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/20'
                            : 'text-muted-foreground hover:text-white hover:bg-white/5'
                    }`}
                >
                    <Cog className="w-4 h-4" />
                    Cài Đặt
                    {hasUnsavedChanges && (
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('commands')}
                    className={`flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-all ${
                        activeTab === 'commands'
                            ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/20'
                            : 'text-muted-foreground hover:text-white hover:bg-white/5'
                    }`}
                >
                    <Terminal className="w-4 h-4" />
                    Danh Sách Lệnh
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'settings' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                    {/* Connection Status Card */}
                    <div className={`p-4 rounded-xl border flex items-center justify-between ${
                        config.enabled && config.hasToken
                            ? 'bg-emerald-500/5 border-emerald-500/20'
                            : 'bg-slate-800/50 border-white/5'
                    }`}>
                        <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${
                                config.enabled && config.hasToken
                                    ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50 animate-pulse'
                                    : 'bg-slate-600'
                            }`} />
                            <div>
                                <span className="text-sm font-medium">
                                    {config.enabled && config.hasToken ? 'Bot đang hoạt động' : 'Bot chưa được kích hoạt'}
                                </span>
                                <p className="text-xs text-muted-foreground">
                                    {config.hasToken ? 'Token đã được cấu hình' : 'Chưa cấu hình Token'}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={loadConfig}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                            title="Làm mới trạng thái"
                        >
                            <RefreshCw className="w-4 h-4 text-muted-foreground" />
                        </button>
                    </div>

                    {/* Message Alert */}
                    {message && (
                        <div
                            className={`p-4 rounded-xl flex items-center gap-3 border animate-in slide-in-from-top duration-300 ${
                                message.type === 'success'
                                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                    : 'bg-red-500/10 border-red-500/20 text-red-400'
                            }`}
                        >
                            {message.type === 'success' ? (
                                <CheckCircle className="w-5 h-5 flex-shrink-0" />
                            ) : (
                                <XCircle className="w-5 h-5 flex-shrink-0" />
                            )}
                            <span className="text-sm">{message.text}</span>
                            <button
                                onClick={() => setMessage(null)}
                                className="ml-auto p-1 hover:bg-white/10 rounded"
                            >
                                <XCircle className="w-4 h-4 opacity-50" />
                            </button>
                        </div>
                    )}

                    {/* Main Settings Card */}
                    <div className="glass-card p-8 space-y-6">
                        <div>
                            <h2 className="text-xl font-semibold mb-1">Cấu Hình Telegram</h2>
                            <p className="text-muted-foreground text-sm">
                                Tự động gửi kết quả quét dưới dạng PDF vào nhóm Telegram sau mỗi lần phân tích hoàn tất.
                            </p>
                        </div>

                        {/* Enable Toggle */}
                        <div className="flex items-center justify-between p-5 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${config.enabled ? 'bg-blue-500/10' : 'bg-white/5'}`}>
                                    <MessageSquare className={`w-5 h-5 ${config.enabled ? 'text-blue-400' : 'text-muted-foreground'}`} />
                                </div>
                                <div>
                                    <label className="font-medium">Bật Thông Báo Telegram</label>
                                    <p className="text-muted-foreground text-sm mt-0.5">
                                        Gửi báo cáo PDF tự động sau khi quét xong
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setConfig({ ...config, enabled: !config.enabled })}
                                className="relative"
                            >
                                {config.enabled ? (
                                    <ToggleRight className="w-10 h-10 text-blue-500 transition-colors" />
                                ) : (
                                    <ToggleLeft className="w-10 h-10 text-slate-600 transition-colors" />
                                )}
                            </button>
                        </div>

                        {/* Bot Token */}
                        <div className="space-y-2">
                            <label className="block font-medium text-sm">
                                Bot Token <span className="text-red-400">*</span>
                            </label>
                            <div className="relative">
                                <input
                                    type={showToken ? 'text' : 'password'}
                                    value={config.botToken}
                                    onChange={(e) => setConfig({ ...config, botToken: e.target.value })}
                                    placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                                    className="w-full px-4 py-3 pr-20 bg-black/20 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 transition-all font-mono text-sm"
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                    <button
                                        onClick={() => setShowToken(!showToken)}
                                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                                        title={showToken ? 'Ẩn token' : 'Hiện token'}
                                    >
                                        {showToken ? (
                                            <EyeOff className="w-4 h-4 text-muted-foreground" />
                                        ) : (
                                            <Eye className="w-4 h-4 text-muted-foreground" />
                                        )}
                                    </button>
                                </div>
                            </div>
                            <p className="text-muted-foreground text-xs pl-1">
                                Lấy token từ{' '}
                                <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer"
                                   className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                                    @BotFather
                                </a>
                            </p>
                        </div>

                        {/* Chat ID */}
                        <div className="space-y-2">
                            <label className="block font-medium text-sm">
                                Chat ID <span className="text-red-400">*</span>
                            </label>
                            <input
                                type="text"
                                value={config.chatId}
                                onChange={(e) => setConfig({ ...config, chatId: e.target.value })}
                                placeholder="-1001234567890"
                                className="w-full px-4 py-3 bg-black/20 border border-white/10 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 transition-all font-mono text-sm"
                            />
                            <p className="text-muted-foreground text-xs pl-1">
                                Lấy Chat ID từ{' '}
                                <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer"
                                   className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                                    @userinfobot
                                </a>
                                {' '}hoặc{' '}
                                <a href="https://t.me/getidsbot" target="_blank" rel="noopener noreferrer"
                                   className="text-blue-400 hover:text-blue-300 underline underline-offset-2">
                                    @getidsbot
                                </a>
                            </p>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={handleTest}
                                disabled={!config.botToken || !config.chatId || testing}
                                className="flex-1 px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 border border-white/10 hover:border-white/20"
                            >
                                {testing ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Đang kiểm tra...
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-4 h-4" />
                                        Kiểm Tra Kết Nối
                                    </>
                                )}
                            </button>

                            <button
                                onClick={handleSave}
                                disabled={!config.botToken || !config.chatId || saving}
                                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-xl font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Đang lưu...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4" />
                                        Lưu Cấu Hình
                                        {hasUnsavedChanges && (
                                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                                        )}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Setup Guide */}
                    <div className="glass-card p-6 border-l-4 border-l-blue-500">
                        <h3 className="text-blue-400 font-semibold mb-3 flex items-center gap-2">
                            <Info className="w-4 h-4" />
                            Hướng dẫn cài đặt
                        </h3>
                        <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                            <li>Tạo bot mới bằng <a href="https://t.me/BotFather" target="_blank" className="text-blue-400 hover:underline">@BotFather</a> trên Telegram để lấy Bot Token</li>
                            <li>Thêm bot vào nhóm chat của bạn và cấp quyền Admin</li>
                            <li>Lấy Chat ID bằng <a href="https://t.me/getidsbot" target="_blank" className="text-blue-400 hover:underline">@getidsbot</a> (thêm bot này vào group, gửi /id)</li>
                            <li>Điền thông tin ở trên, nhấn <strong className="text-white">Kiểm Tra Kết Nối</strong> để xác nhận</li>
                            <li>Bật thông báo và nhấn <strong className="text-white">Lưu Cấu Hình</strong></li>
                        </ol>
                    </div>
                </div>
            )}

            {activeTab === 'commands' && (
                <div className="space-y-6 animate-in fade-in duration-300">
                    {/* Commands Header */}
                    <div className="glass-card p-6">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                                <Terminal className="w-6 h-6 text-emerald-400" />
                            </div>
                            <div>
                                <h2 className="text-xl font-semibold">Danh Sách Lệnh Bot</h2>
                                <p className="text-muted-foreground text-sm mt-1">
                                    Tổng cộng <strong className="text-white">{BOT_COMMANDS.length} lệnh</strong> khả dụng.
                                    Sử dụng các lệnh này trong nhóm Telegram để tương tác với SCA Bot.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Category Filters */}
                    <div className="flex gap-2 flex-wrap">
                        {Object.entries(CATEGORY_LABELS).map(([key, val]) => {
                            const count = BOT_COMMANDS.filter(c => c.category === key).length;
                            return (
                                <span key={key} className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${val.color}`}>
                                    {val.label} ({count})
                                </span>
                            );
                        })}
                    </div>

                    {/* Command Cards */}
                    <div className="space-y-3">
                        {BOT_COMMANDS.map((cmd) => {
                            const catStyle = CATEGORY_LABELS[cmd.category];
                            return (
                                <div
                                    key={cmd.command}
                                    className="glass-card p-5 hover:bg-white/[0.03] transition-all group"
                                >
                                    <div className="flex items-start gap-4">
                                        {/* Icon */}
                                        <div className={`p-2.5 rounded-xl border flex-shrink-0 ${catStyle.color}`}>
                                            {cmd.icon}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-3 mb-1">
                                                <code className="text-base font-bold text-white bg-white/5 px-2.5 py-0.5 rounded-lg border border-white/10">
                                                    {cmd.command}
                                                </code>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${catStyle.color}`}>
                                                    {catStyle.label}
                                                </span>
                                            </div>

                                            <p className="text-sm text-slate-300 mt-1.5">
                                                {cmd.description}
                                            </p>

                                            {/* Usage */}
                                            <div className="mt-3 flex items-center gap-2">
                                                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Cú pháp:</span>
                                                <code className="text-xs bg-black/30 text-blue-300 px-2.5 py-1 rounded-md border border-white/5 font-mono">
                                                    {cmd.usage}
                                                </code>
                                                <button
                                                    onClick={() => handleCopyCommand(cmd.usage)}
                                                    className="p-1.5 hover:bg-white/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                    title="Sao chép lệnh"
                                                >
                                                    {copiedCmd === cmd.usage ? (
                                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                    ) : (
                                                        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                                                    )}
                                                </button>
                                            </div>

                                            {/* Example */}
                                            {cmd.example && (
                                                <div className="mt-2 flex items-center gap-2">
                                                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Ví dụ:</span>
                                                    <code className="text-xs bg-emerald-500/5 text-emerald-300 px-2.5 py-1 rounded-md border border-emerald-500/10 font-mono">
                                                        {cmd.example}
                                                    </code>
                                                    <button
                                                        onClick={() => handleCopyCommand(cmd.example!)}
                                                        className="p-1.5 hover:bg-white/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                        title="Sao chép ví dụ"
                                                    >
                                                        {copiedCmd === cmd.example ? (
                                                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                                                        ) : (
                                                            <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                                                        )}
                                                    </button>
                                                </div>
                                            )}

                                            {/* Notes */}
                                            {cmd.notes && (
                                                <div className="mt-3 p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg">
                                                    <p className="text-xs text-amber-200/80 flex items-start gap-2">
                                                        <Info className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                                                        {cmd.notes}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Topic Rules Info */}
                    <div className="glass-card p-6 border-l-4 border-l-purple-500">
                        <h3 className="text-purple-400 font-semibold mb-3 flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            Quy tắc Topic
                        </h3>
                        <div className="text-sm text-muted-foreground space-y-2">
                            <div className="flex items-start gap-2">
                                <span className="text-purple-400 font-bold">•</span>
                                <span>Topic <strong className="text-white">"Bot Command"</strong>: Chỉ topic này mới được gọi <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded">/scan</code>, <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded">/help</code>, <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded">/listscan</code></span>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-purple-400 font-bold">•</span>
                                <span>Topic <strong className="text-white">dự án</strong>: Có thể gọi <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded">/status</code>, <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded">/rescan</code>, <code className="text-xs bg-white/5 px-1.5 py-0.5 rounded">/delete</code> mà không cần scan_id</span>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-purple-400 font-bold">•</span>
                                <span>Bot tự động tạo <strong className="text-white">topic mới</strong> cho mỗi dự án khi quét xong, gửi PDF vào đó</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
