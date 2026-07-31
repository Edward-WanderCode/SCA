import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Copy, Check, Webhook } from 'lucide-react';
import { projectsApi } from '@/lib/api';

interface WebhookConfigModalProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
}

export function WebhookConfigModal({ projectId, projectName, onClose }: WebhookConfigModalProps) {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<string>('github');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Fetch current config
  const { data: config, isLoading, error } = useQuery({
    queryKey: ['webhookConfig', projectId],
    queryFn: () => projectsApi.getWebhookConfig(projectId),
    retry: false, // Don't retry on 404
  });

  const isConfigured = !!config && !error;

  const generateMutation = useMutation({
    mutationFn: () => projectsApi.generateWebhookConfig(projectId, provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhookConfig', projectId] });
    },
    onError: (err: any) => {
      alert(err.response?.data?.detail || err.message || 'Failed to generate webhook configuration');
    }
  });

  const copyToClipboard = (text: string, type: 'url' | 'secret') => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: 24,
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="glass-card"
          style={{
            width: '100%',
            maxWidth: 500,
            padding: 24,
            position: 'relative',
            backgroundColor: 'var(--bg-secondary)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <X size={20} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'rgba(99, 102, 241, 0.12)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Webhook size={20} color="var(--accent-indigo)" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Webhook Configuration</h3>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                {projectName}
              </p>
            </div>
          </div>

          {isLoading ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
              Loading configuration...
            </div>
          ) : isConfigured ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ padding: '12px 16px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 8 }}>
                <p style={{ fontSize: '0.8125rem', color: 'var(--accent-emerald)', fontWeight: 500 }}>
                  ✓ Webhook is actively configured for {config.provider === 'gitlab' ? 'GitLab' : 'GitHub'}
                </p>
              </div>
              
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                  Payload URL
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="input"
                    value={config.webhook_url}
                    readOnly
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8125rem' }}
                  />
                  <button className="btn btn-secondary" onClick={() => copyToClipboard(config.webhook_url, 'url')}>
                    {copiedUrl ? <Check size={16} color="var(--accent-emerald)" /> : <Copy size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                  Secret Token
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="input"
                    value={config.webhook_secret}
                    readOnly
                    type="password"
                    style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8125rem' }}
                  />
                  <button className="btn btn-secondary" onClick={() => copyToClipboard(config.webhook_secret, 'secret')}>
                    {copiedSecret ? <Check size={16} color="var(--accent-emerald)" /> : <Copy size={16} />}
                  </button>
                </div>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                  Configure your {config.provider === 'gitlab' ? 'GitLab repository webhook settings' : 'GitHub repository Webhooks'} with this URL and Secret. The payload content type must be <code>application/json</code>.
                </p>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    if (confirm('Are you sure you want to regenerate the secret? The old one will stop working immediately.')) {
                      generateMutation.mutate();
                    }
                  }}
                  disabled={generateMutation.isPending}
                  style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}
                >
                  Regenerate Secret
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                Set up a CI/CD Webhook to automatically trigger scans on push and pull requests, and report findings directly to your repository.
              </p>
              
              <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                  VCS Provider
                </label>
                <select 
                  className="input" 
                  value={provider} 
                  onChange={(e) => setProvider(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="github">GitHub</option>
                  <option value="gitlab">GitLab</option>
                </select>
              </div>

              <div style={{ marginTop: 8 }}>
                <button 
                  className="btn btn-primary" 
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => generateMutation.mutate()}
                  disabled={generateMutation.isPending}
                >
                  {generateMutation.isPending ? 'Generating...' : 'Generate Webhook Configuration'}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
