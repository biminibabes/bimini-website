// Navigation functionality
document.addEventListener('DOMContentLoaded', function() {
    const navButtons = document.querySelectorAll('.nav-button');
    const sections = document.querySelectorAll('.content-section');

    navButtons.forEach(button => {
        button.addEventListener('click', function() {
            const sectionName = this.getAttribute('data-section');
            
            // Remove active class from all buttons and sections
            navButtons.forEach(btn => btn.classList.remove('active'));
            sections.forEach(section => section.classList.remove('active'));
            
            // Add active class to clicked button and corresponding section
            this.classList.add('active');
            document.getElementById(`${sectionName}-section`).classList.add('active');
        });
    });
});

// Optional: Add glitch effect on logo hover
const logo = document.querySelector('.logo');
if (logo) {
    logo.addEventListener('mouseenter', function() {
        this.style.animation = 'glitch 0.3s';
        setTimeout(() => {
            this.style.animation = 'float 6s ease-in-out infinite';
        }, 300);
    });
}

// Optional: Easter egg - Konami code for fun
let konamiCode = [];
const correctCode = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];

document.addEventListener('keydown', function(e) {
    konamiCode.push(e.keyCode);
    konamiCode = konamiCode.slice(-10);
    
    if (JSON.stringify(konamiCode) === JSON.stringify(correctCode)) {
        document.body.style.animation = 'rainbow 2s infinite';
        setTimeout(() => {
            document.body.style.animation = '';
        }, 5000);
    }
});
