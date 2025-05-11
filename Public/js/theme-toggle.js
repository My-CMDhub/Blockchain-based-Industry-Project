// Theme toggle script for the demo UI

// Function to toggle between light and dark theme
function toggleTheme() {
    // Check if dark mode is currently active
    const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
    
    // Toggle the theme
    if (isDarkMode) {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    }
}

// Function to initialize theme based on localStorage or system preference
function initializeTheme() {
    // Check localStorage first
    const storedTheme = localStorage.getItem('theme');
    
    if (storedTheme) {
        // Apply stored theme
        document.documentElement.setAttribute('data-theme', storedTheme);
    } else {
        // Check system preference
        const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        if (prefersDarkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            localStorage.setItem('theme', 'light');
        }
    }
}

// Initialize theme on page load
document.addEventListener('DOMContentLoaded', initializeTheme); 