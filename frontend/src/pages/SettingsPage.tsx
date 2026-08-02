/* Settings page with Telegram configuration and connection testing */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Server,
  Database,
  Shield,
  Send,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  RotateCcw,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/lib/api';

export default function SettingsPage() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: () => settingsApi.get(),
  });

  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramCommandThreadId, setTelegramCommandThreadId] = useState<number | ''>(306);
  const [telegramBotApiUrl, setTelegramBotApiUrl] = useState('http://telegram-bot-api:8081');
  const [telegramApiId, setTelegramApiId] = useState('');
  const [telegramApiHash, setTelegramApiHash] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [showApiHash, setShowApiHash] = useState(false);

  const [opengrepImage, setOpengrepImage] = useState('opengrep/opengrep:latest');
  const [trivyImage, setTrivyImage] = useState('aquasec/trivy:latest');
  const [trufflehogImage, setTrufflehogImage] = useState('trufflesecurity/trufflehog:latest');
  const [maxConcurrentScans, setMaxConcurrentScans] = useState<number>(3);

  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState('');

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');

  // Update local state when query finishes
  useEffect(() => {
    if (settings) {
      setTelegramBotToken(settings.telegram_bot_token || '');
      setTelegramChatId(settings.telegram_chat_id || '');
      setTelegramCommandThreadId(settings.telegram_bot_command_thread_id ?? 306);
      setTelegramBotApiUrl(settings.telegram_bot_api_url || 'http://telegram-bot-api:8081');
      setTelegramApiId(settings.telegram_api_id || '');
      setTelegramApiHash(settings.telegram_api_hash || '');
      setOpengrepImage(settings.opengrep_image || 'opengrep/opengrep:latest');
      setTrivyImage(settings.trivy_image || 'aquasec/trivy:latest');
      setTrufflehogImage(settings.trufflehog_image || 'trufflesecurity/trufflehog:latest');
      setMaxConcurrentScans(settings.max_concurrent_scans || 3);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: () =>
      settingsApi.update({
        telegram_bot_token: telegramBotToken,
        telegram_chat_id: telegramChatId,
        telegram_bot_command_thread_id: telegramCommandThreadId !== '' ? Number(telegramCommandThreadId) : undefined,
        telegram_bot_api_url: telegramBotApiUrl,
        telegram_api_id: telegramApiId,
        telegram_api_hash: telegramApiHash,
        opengrep_image: opengrepImage,
        trivy_image: trivyImage,
        trufflehog_image: trufflehogImage,
        max_concurrent_scans: Number(maxConcurrentScans),
      }),
    onMutate: () => {
      setSaveStatus('saving');
      setSaveMessage('');
    },
    onSuccess: () => {
      setSaveStatus('success');
      setSaveMessage('Đã lưu thành công các cài đặt hệ thống!');
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      setTimeout(() => setSaveStatus('idle'), 4000);
    },
    onError: (err: any) => {
      setSaveStatus('error');
      setSaveMessage(err.response?.data?.detail || 'Lưu cài đặt thất bại. Vui lòng thử lại.');
    },
  });

  const testTelegramMutation = useMutation({
    mutationFn: () =>
      settingsApi.testTelegram({
        telegram_bot_token: telegramBotToken,
        telegram_chat_id: telegramChatId,
        telegram_bot_command_thread_id: telegramCommandThreadId !== '' ? Number(telegramCommandThreadId) : undefined,
        telegram_bot_api_url: telegramBotApiUrl,
        telegram_api_id: telegramApiId,
        telegram_api_hash: telegramApiHash,
      }),
    onMutate: () => {
      setTestStatus('testing');
      setTestMessage('');
    },
    onSuccess: (data) => {
      setTestStatus('success');
      setTestMessage(data.message || 'Kết nối thành công tới Bot Telegram!');
    },
    onError: (err: any) => {
      setTestStatus('error');
      const detail = err.response?.data?.detail;
      const errorMsg = typeof detail === 'string'
        ? detail
        : (typeof detail === 'object' ? JSON.stringify(detail) : (err.message || 'Không thể gửi tin nhắn thử nghiệm tới Telegram.'));
      setTestMessage(errorMsg);
    },
  });

  const handleReset = () => {
    if (settings) {
      setTelegramBotToken(settings.telegram_bot_token || '');
      setTelegramChatId(settings.telegram_chat_id || '');
      setTelegramCommandThreadId(settings.telegram_bot_command_thread_id ?? 306);
      setTelegramBotApiUrl(settings.telegram_bot_api_url || 'http://telegram-bot-api:8081');
      setTelegramApiId(settings.telegram_api_id || '');
      setTelegramApiHash(settings.telegram_api_hash || '');
      setOpengrepImage(settings.opengrep_image || 'opengrep/opengrep:latest');
      setTrivyImage(settings.trivy_image || 'aquasec/trivy:latest');
      setTrufflehogImage(settings.trufflehog_image || 'trufflesecurity/trufflehog:latest');
      setMaxConcurrentScans(settings.max_concurrent_scans || 3);
      setTestStatus('idle');
      setSaveStatus('idle');
    }
  };


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>
      {/* Page Header */}
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Hệ thống & Cấu hình</h2>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>
          Quản lý các thông số kết nối Telegram bot, công cụ quét bảo mật và cấu hình máy chủ
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1fr)', gap: 24, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>


      {/* Save Notification Alert */}
      {saveStatus === 'success' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#10b981',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <CheckCircle2 size={18} />
          <span>{saveMessage}</span>
        </motion.div>
      )}

      {saveStatus === 'error' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <AlertCircle size={18} />
          <span>{saveMessage}</span>
        </motion.div>
      )}

      {/* Telegram Configuration */}
      <motion.div
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ padding: 24 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Send size={16} color="#38bdf8" />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Cấu hình Telegram Bot Notifications</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Tự động gửi thông báo kết quả quét và báo cáo HTML trực tiếp qua Telegram
              </p>
            </div>
          </div>

          <span
            className={`badge ${telegramBotToken && telegramChatId ? 'badge-low' : ''}`}
            style={{
              fontSize: '0.75rem',
              background: telegramBotToken && telegramChatId ? 'rgba(16, 185, 129, 0.12)' : 'rgba(156, 163, 175, 0.12)',
              color: telegramBotToken && telegramChatId ? '#10b981' : '#9ca3af',
              border: `1px solid ${telegramBotToken && telegramChatId ? 'rgba(16, 185, 129, 0.3)' : 'rgba(156, 163, 175, 0.3)'}`,
            }}
          >
            {telegramBotToken && telegramChatId ? '● CONFIGURED' : '○ NOT CONFIGURED'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Bot Token */}
          <div>
            <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Telegram Bot Token
            </label>
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                type={showToken ? 'text' : 'password'}
                placeholder="Ví dụ: 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value)}
                style={{ paddingRight: 40, fontFamily: showToken ? 'inherit' : 'monospace' }}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setShowToken(!showToken)}
                style={{
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: 6,
                  color: 'var(--text-muted)',
                }}
              >
                {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
              Token được cấp bởi BotFather khi tạo Bot (@BotFather)
            </span>
          </div>

          {/* Chat ID & Thread ID in 2 columns */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Telegram Chat ID / Group ID
              </label>
              <input
                className="input"
                placeholder="Ví dụ: -1001234567890"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                ID của Chat nhóm hoặc Kênh Forum Telegram nhận thông báo
              </span>
            </div>

            <div>
              <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Bot Command Thread ID (Topic)
              </label>
              <input
                className="input"
                type="number"
                placeholder="Ví dụ: 306"
                value={telegramCommandThreadId}
                onChange={(e) => setTelegramCommandThreadId(e.target.value ? Number(e.target.value) : '')}
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                Thread/Topic ID chuyên biệt dùng cho lệnh điều khiển Bot
              </span>
            </div>
          </div>

          {/* Telegram Local Bot API Server & API Credentials (Large File Upload up to 2GB) */}
          <div style={{ paddingTop: 16, borderTop: '1px solid rgba(71, 85, 105, 0.15)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Telegram Bot API Server URL (Upload File Lớn &lt; 2GB)
              </label>
              <input
                className="input"
                placeholder="http://telegram-bot-api:8081"
                value={telegramBotApiUrl}
                onChange={(e) => setTelegramBotApiUrl(e.target.value)}
                style={{ fontFamily: "'JetBrains Mono', monospace" }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                Đường dẫn Local Bot API Server. Đặt <code>http://telegram-bot-api:8081</code> cho Docker local server hoặc <code>https://api.telegram.org</code> (Mặc định giới hạn 50MB)
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                  Telegram API ID (my.telegram.org)
                </label>
                <input
                  className="input"
                  placeholder="Ví dụ: 12345678"
                  value={telegramApiId}
                  onChange={(e) => setTelegramApiId(e.target.value)}
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                  API ID tài khoản Telegram cá nhân (Lấy từ my.telegram.org)
                </span>
              </div>

              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                  Telegram API Hash (my.telegram.org)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={showApiHash ? 'text' : 'password'}
                    placeholder="Ví dụ: 0123456789abcdef0123456789abcdef"
                    value={telegramApiHash}
                    onChange={(e) => setTelegramApiHash(e.target.value)}
                    style={{ paddingRight: 40, fontFamily: showApiHash ? "'JetBrains Mono', monospace" : 'monospace' }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowApiHash(!showApiHash)}
                    style={{
                      position: 'absolute',
                      right: 6,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      padding: 6,
                      color: 'var(--text-muted)',
                    }}
                  >
                    {showApiHash ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
                  API Hash ứng dụng Telegram (Lấy từ my.telegram.org)
                </span>
              </div>
            </div>
          </div>

          {/* Test Telegram Connection Button & Output */}
          <div style={{ marginTop: 6, paddingTop: 16, borderTop: '1px solid rgba(71, 85, 105, 0.15)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => testTelegramMutation.mutate()}
                disabled={testStatus === 'testing' || !telegramBotToken || !telegramChatId}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: '0.8125rem',
                  opacity: !telegramBotToken || !telegramChatId ? 0.5 : 1,
                  cursor: !telegramBotToken || !telegramChatId ? 'not-allowed' : 'pointer',
                }}
              >
                {testStatus === 'testing' ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Đang thử kết nối...
                  </>
                ) : (
                  <>
                    <Send size={14} color="#38bdf8" />
                    Thử kết nối Telegram
                  </>
                )}
              </button>

              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Hệ thống sẽ gửi 1 tin nhắn thử nghiệm tới Telegram
              </span>
            </div>

            {testStatus === 'success' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  color: '#10b981',
                  fontSize: '0.8125rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <CheckCircle2 size={16} />
                <span>{testMessage}</span>
              </motion.div>
            )}

            {testStatus === 'error' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#ef4444',
                  fontSize: '0.8125rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <AlertCircle size={16} />
                <span>{testMessage}</span>
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Scanner Configuration */}
      <motion.div
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        style={{ padding: 24 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Shield size={18} color="var(--accent-indigo)" />
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Cấu hình công cụ quét (Scanner Docker Images)</h3>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              OpenGrep SAST Image
            </label>
            <input
              className="input"
              value={opengrepImage}
              onChange={(e) => setOpengrepImage(e.target.value)}
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Trivy Vulnerability Image
            </label>
            <input
              className="input"
              value={trivyImage}
              onChange={(e) => setTrivyImage(e.target.value)}
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              TruffleHog Secret Detection Image
            </label>
            <input
              className="input"
              value={trufflehogImage}
              onChange={(e) => setTrufflehogImage(e.target.value)}
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            />
          </div>
        </div>
      </motion.div>

      {/* Server Configuration */}
      <motion.div
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        style={{ padding: 24 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Server size={18} color="var(--accent-emerald)" />
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Cấu hình Máy chủ & Tiến trình</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Số lượng lượt quét đồng thời tối đa (Max Concurrent Scans)
            </label>
            <input
              className="input"
              type="number"
              min={1}
              max={10}
              value={maxConcurrentScans}
              onChange={(e) => setMaxConcurrentScans(Number(e.target.value))}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
              Thời gian Timeout cho mỗi lượt quét (giây)
            </label>
            <input className="input" type="number" defaultValue="600" disabled readOnly style={{ opacity: 0.6 }} />
          </div>
        </div>
      </motion.div>

      {/* System Status */}
      <motion.div
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        style={{ padding: 24 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Database size={18} color="var(--accent-cyan)" />
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Trạng thái hệ thống</h3>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            { name: 'PostgreSQL', status: 'Connected', color: '#10b981' },
            { name: 'Redis Cache', status: 'Connected', color: '#10b981' },
            { name: 'Celery Workers', status: `Running (${maxConcurrentScans})`, color: '#10b981' },
          ].map((service) => (
            <div
              key={service.name}
              style={{
                padding: '14px 16px',
                borderRadius: 10,
                background: 'rgba(16, 185, 129, 0.06)',
                border: '1px solid rgba(16, 185, 129, 0.15)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: service.color,
                    boxShadow: `0 0 6px ${service.color}`,
                  }}
                />
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{service.name}</span>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)' }}>{service.status}</span>
            </div>
          ))}
        </div>
      </motion.div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
          <button
            className="btn btn-secondary"
            onClick={handleReset}
            disabled={saveStatus === 'saving'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <RotateCcw size={14} />
            Đặt lại (Reset)
          </button>
          <button
            className="btn btn-primary"
            onClick={() => saveMutation.mutate()}
            disabled={saveStatus === 'saving'}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {saveStatus === 'saving' ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Đang lưu...
              </>
            ) : (
              <>
                <Save size={16} />
                Lưu thay đổi
              </>
            )}
          </button>
        </div>
      </div>

      {/* Right Column: Setup Helper & Guides */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <motion.div
          className="glass-card"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Shield size={20} color="var(--accent-indigo)" />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Hướng dẫn Cấu hình Nhanh</h3>
          </div>

          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>1. Telegram Bot Token</div>
              <div>Tạo bot mới qua <b>@BotFather</b> trên Telegram và sao chép mã Token vào ô cấu hình.</div>
            </div>

            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>2. Chat ID / Forum Supergroup</div>
              <div>Thêm Bot vào Nhóm / Kênh Telegram của bạn và cấp quyền Quản trị viên (Admin) để tạo Topic và gửi thông báo.</div>
            </div>

            <div style={{ padding: 12, borderRadius: 8, background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>3. Local Telegram Bot API Server</div>
              <div>Nếu upload file báo cáo SARIF lớn ({'>'} 50MB), điền <b>API ID</b> và <b>API Hash</b> nhận từ <i>my.telegram.org</i>.</div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  </div>
);
}


