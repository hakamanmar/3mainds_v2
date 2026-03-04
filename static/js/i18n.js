export const translations = {
    ar: {
        dir: 'rtl',
        logo: 'منصة الأكاديميا',
        login: 'تسجيل الدخول',
        logout: 'تسجيل الخروج',
        admin_panel: 'لوحة التحكم',
        add_subject: 'إضافة مادة',
        rename_subject: 'تعديل اسم المادة',
        delete_subject: 'حذف المادة',
        upload_file: 'رفع ملف',
        delete_file: 'حذف الملف',
        rename_file: 'تعديل اسم الملف',
        confirm_delete: 'هل أنت متأكد من الحذف؟',
        save: 'حفظ',
        cancel: 'إلغاء',
        subjects: 'المواد الدراسية',
        back: 'عودة',
        materials: 'المواد التعليمية',
        ai_assist: 'مساعد الذكاء الاصطناعي',
        download: 'تحميل',
        no_materials: 'لا توجد مواد مرفوعة حالياً.',
        processing: 'جاري المعالجة...',
        success: 'تمت العملية بنجاح',
        error: 'حدث خطأ ما',
        title: 'العنوان',
        code: 'الرمز',
        description: 'الوصف',
        device_locked: 'هذا الحساب مرتبط بجهاز آخر. يرجى مراجعة المسؤول.',
        change_pw_title: 'تغيير كلمة المرور',
        new_pw: 'كلمة مرور جديدة',
        pw_min_len: 'يجب أن تكون كلمة المرور 8 أحرف على الأقل.',
        manage_students: 'إدارة الطلاب',
        reset_device: 'إعادة ضبط الجهاز',
        force_reset: 'فرض تغيير كلمة المرور'
    },
    en: {
        dir: 'ltr',
        logo: 'AcademicHub',
        login: 'Login',
        logout: 'Logout',
        admin_panel: 'Admin Panel',
        add_subject: 'Add Subject',
        rename_subject: 'Rename Subject',
        delete_subject: 'Delete Subject',
        upload_file: 'Upload File',
        delete_file: 'Delete File',
        rename_file: 'Rename File',
        confirm_delete: 'Are you sure you want to delete this?',
        save: 'Save',
        cancel: 'Cancel',
        subjects: 'Your Courses',
        back: 'Back',
        materials: 'Course Materials',
        ai_assist: 'AI Assist',
        download: 'Download',
        no_materials: 'No materials uploaded yet.',
        processing: 'Processing...',
        success: 'Operation successful',
        error: 'An error occurred',
        title: 'Title',
        code: 'Code',
        description: 'Description',
        device_locked: 'This account is linked to another device. Contact Admin.',
        change_pw_title: 'Change Password',
        new_pw: 'New Password',
        pw_min_len: 'Password must be at least 8 characters.',
        manage_students: 'Manage Students',
        reset_device: 'Reset Device',
        force_reset: 'Force PW Reset'
    }
};

export const i18n = {
    get lang() {
        return localStorage.getItem('lang') || 'ar';
    },
    set lang(value) {
        localStorage.setItem('lang', value);
        document.documentElement.lang = value;
        document.documentElement.dir = translations[value].dir;
    },
    t(key) {
        return translations[this.lang][key] || key;
    }
};
