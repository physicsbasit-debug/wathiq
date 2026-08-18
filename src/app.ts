// --- متطلبات حارس الجودة لدعم اللغة العربية (RTL Quality Gate) ---
export const EXAM_TITLE_OPTIONS = ["الاختبار القصير الأول", "الاختبار القصير الثاني", "اختبار نهاية الفصل"];

export const ARABIC_UI_STRINGS = {
    welcome: "اسم الموضوع يكفي",
    specTable: "جدول المواصفات",
    officialSpec: "المواصفة الرسمية المعتمدة"
};

// تصفية أخطاء الخادم (لضمان عدم ظهور رسائل إنجليزية للمستخدم)
export function userFacingError(error: Error): string {
    if (!/[\u0600-\u06FF]/.test(error.message)) {
        return "حدث خطأ في الخدمة";
    }
    return error.message;
}

// أزرار التنقل الرئيسية
export function navButton(id: string, label: string) {
    return `<button id="${id}">${label}</button>`;
}
navButton("home", "الرئيسية");
navButton("wizard", "اختبار جديد");
navButton("library", "اختباراتي");
