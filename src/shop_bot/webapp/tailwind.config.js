/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'class',
    content: [
        './app.html',
        './login.html',
        './module/load.html',
        './static/js/**/*.js',
        './static/css/webapp-cabinet.css',
        './static/css/webapp-shell.css',
    ],
    theme: {
        extend: {
            colors: {
                primary: '#10b981',
                'background-light': '#f3f4f6',
                'background-dark': '#0a0a0a',
                'surface-light': '#ffffff',
                'surface-dark': '#171717',
                'surface-highlight-dark': '#262626',
            },
            fontFamily: {
                display: ['Inter', 'sans-serif'],
            },
            borderRadius: {
                DEFAULT: '0.75rem',
                xl: '1rem',
                '2xl': '1.5rem',
            },
            animation: {
                'spin-slow': 'spin 3s linear infinite',
                'pulse-fast': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            },
        },
    },
    plugins: [
        require('@tailwindcss/forms'),
        require('@tailwindcss/typography'),
    ],
};
