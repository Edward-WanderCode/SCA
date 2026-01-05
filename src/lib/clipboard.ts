/**
 * Copy text to clipboard with fallback support
 * Works even when Clipboard API is not available (HTTP contexts)
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    // Method 1: Try modern Clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.warn('Clipboard API failed, trying fallback method...', err);
        }
    }

    // Method 2: Fallback using execCommand (works in HTTP)
    try {
        // Create a temporary textarea element
        const textarea = document.createElement('textarea');
        textarea.value = text;

        // Make it invisible and non-interactive
        textarea.style.position = 'fixed';
        textarea.style.top = '0';
        textarea.style.left = '0';
        textarea.style.width = '2em';
        textarea.style.height = '2em';
        textarea.style.padding = '0';
        textarea.style.border = 'none';
        textarea.style.outline = 'none';
        textarea.style.boxShadow = 'none';
        textarea.style.background = 'transparent';
        textarea.style.opacity = '0';

        // Append to body
        document.body.appendChild(textarea);

        // Select and copy
        textarea.focus();
        textarea.select();

        // For iOS compatibility
        const range = document.createRange();
        range.selectNodeContents(textarea);
        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
        }
        textarea.setSelectionRange(0, textarea.value.length);

        // Execute copy command
        const successful = document.execCommand('copy');

        // Clean up
        document.body.removeChild(textarea);

        if (successful) {
            return true;
        } else {
            throw new Error('execCommand("copy") failed');
        }
    } catch (err) {
        console.error('All clipboard methods failed:', err);
        return false;
    }
}

/**
 * Copy text to clipboard and show feedback
 */
export async function copyWithFeedback(
    text: string,
    onSuccess?: () => void,
    onError?: () => void
): Promise<void> {
    const success = await copyToClipboard(text);

    if (success) {
        onSuccess?.();
    } else {
        onError?.();
    }
}
