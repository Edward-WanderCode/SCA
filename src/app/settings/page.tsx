'use client';

import { useState, useEffect } from 'react';
import { Settings, Send, CheckCircle, XCircle, Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface TelegramConfig {
    botToken: string;
    chatId: string;
    enabled: boolean;
    hasToken?: boolean;
}

export default function SettingsPage() {
    const [config, setConfig] = useState<TelegramConfig>({
        botToken: '',
        chatId: '',
        enabled: false,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        try {
            const response = await fetch('/api/telegram');
            const data = await response.json();
            setConfig(data);
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

            setMessage({ type: 'success', text: 'Configuration saved successfully!' });
        } catch (error) {
            setMessage({
                type: 'error',
                text: error instanceof Error ? error.message : 'Failed to save configuration',
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

            setMessage({ type: 'success', text: 'Connection test successful! Check your Telegram chat.' });
        } catch (error) {
            setMessage({
                type: 'error',
                text: error instanceof Error ? error.message : 'Connection test failed',
            });
        } finally {
            setTesting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950 p-8">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors mb-4"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Dashboard
                    </Link>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-3 bg-blue-500/10 rounded-xl backdrop-blur-sm border border-blue-500/20">
                            <Settings className="w-8 h-8 text-blue-400" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold text-white">Settings</h1>
                            <p className="text-slate-400 mt-1">Configure Telegram notifications for scan results</p>
                        </div>
                    </div>
                </div>

                {/* Main Card */}
                <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
                    <div className="mb-6">
                        <h2 className="text-xl font-semibold text-white mb-2">Telegram Integration</h2>
                        <p className="text-slate-400 text-sm">
                            Automatically send scan results as PDF to your Telegram chat group after each scan completes.
                        </p>
                    </div>

                    {/* Message Alert */}
                    {message && (
                        <div
                            className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${message.type === 'success'
                                    ? 'bg-green-500/10 border border-green-500/20 text-green-400'
                                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                                }`}
                        >
                            {message.type === 'success' ? (
                                <CheckCircle className="w-5 h-5" />
                            ) : (
                                <XCircle className="w-5 h-5" />
                            )}
                            <span>{message.text}</span>
                        </div>
                    )}

                    {/* Form */}
                    <div className="space-y-6">
                        {/* Enable Toggle */}
                        <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
                            <div>
                                <label className="text-white font-medium">Enable Telegram Notifications</label>
                                <p className="text-slate-400 text-sm mt-1">
                                    Send PDF reports automatically after scan completion
                                </p>
                            </div>
                            <button
                                onClick={() => setConfig({ ...config, enabled: !config.enabled })}
                                className={`relative w-14 h-7 rounded-full transition-colors ${config.enabled ? 'bg-blue-500' : 'bg-slate-600'
                                    }`}
                            >
                                <div
                                    className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${config.enabled ? 'translate-x-7' : 'translate-x-0'
                                        }`}
                                />
                            </button>
                        </div>

                        {/* Bot Token */}
                        <div>
                            <label className="block text-white font-medium mb-2">
                                Bot Token <span className="text-red-400">*</span>
                            </label>
                            <input
                                type="password"
                                value={config.botToken}
                                onChange={(e) => setConfig({ ...config, botToken: e.target.value })}
                                placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all"
                            />
                            <p className="text-slate-400 text-sm mt-2">
                                Get your bot token from{' '}
                                <a
                                    href="https://t.me/BotFather"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 underline"
                                >
                                    @BotFather
                                </a>
                            </p>
                        </div>

                        {/* Chat ID */}
                        <div>
                            <label className="block text-white font-medium mb-2">
                                Chat ID <span className="text-red-400">*</span>
                            </label>
                            <input
                                type="text"
                                value={config.chatId}
                                onChange={(e) => setConfig({ ...config, chatId: e.target.value })}
                                placeholder="-1001234567890"
                                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 transition-all"
                            />
                            <p className="text-slate-400 text-sm mt-2">
                                Get your chat ID from{' '}
                                <a
                                    href="https://t.me/userinfobot"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 underline"
                                >
                                    @userinfobot
                                </a>
                                {' '}or{' '}
                                <a
                                    href="https://t.me/getidsbot"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 underline"
                                >
                                    @getidsbot
                                </a>
                            </p>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-4 pt-4">
                            <button
                                onClick={handleTest}
                                disabled={!config.botToken || !config.chatId || testing}
                                className="flex-1 px-6 py-3 bg-slate-700/50 hover:bg-slate-700 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 border border-slate-600/50"
                            >
                                {testing ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Testing...
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-5 h-5" />
                                        Test Connection
                                    </>
                                )}
                            </button>

                            <button
                                onClick={handleSave}
                                disabled={!config.botToken || !config.chatId || saving}
                                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="w-5 h-5" />
                                        Save Configuration
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Info Box */}
                    <div className="mt-8 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <h3 className="text-blue-400 font-medium mb-2">📱 How to set up:</h3>
                        <ol className="text-slate-300 text-sm space-y-1 list-decimal list-inside">
                            <li>Create a bot using @BotFather on Telegram and get the bot token</li>
                            <li>Add your bot to your group chat</li>
                            <li>Get your group chat ID using @userinfobot or @getidsbot</li>
                            <li>Enter the credentials above and test the connection</li>
                            <li>Enable notifications and save</li>
                        </ol>
                    </div>
                </div>
            </div>
        </div>
    );
}
