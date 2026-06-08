/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: 'class',
    content: [
        './login.html',
        './module/load.html',
    ],
    theme: {
        extend: {
            colors: {
                primary: '#3390EC',
                'background-light': '#ffffff',
                'background-dark': '#17212B',
                'surface-light': '#ffffff',
                'surface-dark': '#232E3C',
                'surface-highlight-dark': '#2B5278',
            },
            fontFamily: {
                display: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Inter', 'sans-serif'],
            },
            borderRadius: {
                DEFAULT: '0.75rem',
                xl: '1rem',
                '2xl': '1.5rem',
            },
        },
    },
    plugins: [
        require('@tailwindcss/forms'),
        require('@tailwindcss/typography'),
    ],
};
