export const tryFormatDate = (dateString: string) => {
    try {
        if (!dateString) return 'Just now';
        return new Date(dateString).toLocaleDateString() + ' ' + new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return dateString;
    }
}
