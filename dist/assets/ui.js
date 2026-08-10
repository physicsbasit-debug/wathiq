export function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
export function formatArabicDate(isoDate) {
    if (!isoDate)
        return "غير محدد";
    const date = new Date(`${isoDate}T12:00:00`);
    return new Intl.DateTimeFormat("ar-OM", {
        year: "numeric",
        month: "long",
        day: "numeric",
    }).format(date);
}
export function icon(name) {
    const paths = {
        home: '<path d="M3 11.5 12 4l9 7.5v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
        plus: '<path d="M12 5v14M5 12h14"/>',
        files: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5M4 7H3v14h11"/>',
        book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5A2.5 2.5 0 0 1 20 21.5z"/>',
        admin: '<path d="M12 3 4.5 6v5c0 5 3.3 8.3 7.5 10 4.2-1.7 7.5-5 7.5-10V6z"/><path d="m9 12 2 2 4-4"/>',
        check: '<path d="m5 12 4 4L19 6"/>',
        arrow: '<path d="m9 18 6-6-6-6"/>',
        save: '<path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/>',
        spark: '<path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}
//# sourceMappingURL=ui.js.map