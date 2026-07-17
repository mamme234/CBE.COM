// Animation Controller

class AnimationController {
    constructor() {
        this.animations = {};
        this.observers = [];
        this.init();
    }

    init() {
        // Initialize intersection observer for scroll animations
        this.setupIntersectionObserver();
        
        // Initialize all animations
        this.initializeAnimations();
        
        // Handle page transitions
        this.setupPageTransitions();
    }

    setupIntersectionObserver() {
        const options = {
            root: null,
            rootMargin: '0px',
            threshold: 0.1
        };

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const element = entry.target;
                    const animation = element.dataset.animation || 'fade-in';
                    this.triggerAnimation(element, animation);
                    this.observer.unobserve(element);
                }
            });
        }, options);

        // Observe all elements with data-animate attribute
        document.querySelectorAll('[data-animate]').forEach(el => {
            this.observer.observe(el);
        });
    }

    initializeAnimations() {
        // Define animation effects
        this.animations = {
            'fade-in': {
                before: {
                    opacity: '0',
                    transform: 'translateY(20px)'
                },
                after: {
                    opacity: '1',
                    transform: 'translateY(0)'
                }
            },
            'slide-left': {
                before: {
                    opacity: '0',
                    transform: 'translateX(-30px)'
                },
                after: {
                    opacity: '1',
                    transform: 'translateX(0)'
                }
            },
            'slide-right': {
                before: {
                    opacity: '0',
                    transform: 'translateX(30px)'
                },
                after: {
                    opacity: '1',
                    transform: 'translateX(0)'
                }
            },
            'scale': {
                before: {
                    opacity: '0',
                    transform: 'scale(0.8)'
                },
                after: {
                    opacity: '1',
                    transform: 'scale(1)'
                }
            },
            'rotate': {
                before: {
                    opacity: '0',
                    transform: 'rotate(-10deg) scale(0.9)'
                },
                after: {
                    opacity: '1',
                    transform: 'rotate(0deg) scale(1)'
                }
            }
        };
    }

    triggerAnimation(element, animationName, duration = 500) {
        const animation = this.animations[animationName];
        if (!animation) {
            console.warn(`Animation "${animationName}" not found`);
            return;
        }

        // Set initial state
        Object.assign(element.style, animation.before);
        
        // Trigger reflow
        void element.offsetHeight;

        // Animate to final state
        element.style.transition = `all ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
        Object.assign(element.style, animation.after);

        // Clean up
        setTimeout(() => {
            element.style.transition = '';
        }, duration);
    }

    // Loading animation for forms
    showLoading(element) {
        const originalText = element.textContent;
        element.textContent = '';
        element.disabled = true;

        const spinner = document.createElement('span');
        spinner.className = 'spinner';
        element.appendChild(spinner);

        return {
            complete: () => {
                element.textContent = originalText;
                element.disabled = false;
                spinner.remove();
            },
            setText: (text) => {
                element.textContent = text;
                element.appendChild(spinner);
            }
        };
    }

    // Progress animation
    animateProgress(progressElement, from = 0, to = 100, duration = 2000) {
        const startTime = performance.now();
        const difference = to - from;
        
        const updateProgress = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const value = from + (difference * progress);
            
            progressElement.style.width = `${value}%`;
            progressElement.setAttribute('aria-valuenow', value);

            if (progress < 1) {
                requestAnimationFrame(updateProgress);
            }
        };

        requestAnimationFrame(updateProgress);
    }

    // Typing animation
    typeText(element, text, speed = 50) {
        return new Promise((resolve) => {
            let index = 0;
            element.textContent = '';
            
            const type = () => {
                if (index < text.length) {
                    element.textContent += text.charAt(index);
                    index++;
                    setTimeout(type, speed);
                } else {
                    resolve();
                }
            };
            
            type();
        });
    }

    // Count animation
    animateCount(element, from, to, duration = 1000) {
        const startTime = performance.now();
        const difference = to - from;
        
        const updateCount = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const value = Math.round(from + (difference * progress));
            
            element.textContent = value;

            if (progress < 1) {
                requestAnimationFrame(updateCount);
            }
        };

        requestAnimationFrame(updateCount);
    }

    // Particle effect
    createParticles(element, count = 20) {
        const rect = element.getBoundingClientRect();
        const particles = [];

        for (let i = 0; i < count; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.cssText = `
                position: fixed;
                width: 4px;
                height: 4px;
                background: ${this.randomColor()};
                border-radius: 50%;
                pointer-events: none;
                left: ${rect.left + rect.width/2}px;
                top: ${rect.top + rect.height/2}px;
                z-index: 9999;
            `;

            document.body.appendChild(particle);
            particles.push(particle);
        }

        // Animate particles
        particles.forEach((particle, index) => {
            const angle = (index / particles.length) * Math.PI * 2;
            const distance = 50 + Math.random() * 100;
            const duration = 800 + Math.random() * 600;

            requestAnimationFrame(() => {
                particle.style.transition = `all ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
                particle.style.transform = `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px)`;
                particle.style.opacity = '0';
            });

            setTimeout(() => {
                particle.remove();
            }, duration + 100);
        });
    }

    randomColor() {
        const colors = ['#c8102e', '#f5a623', '#1a1a2e', '#4CAF50', '#2196F3'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    setupPageTransitions() {
        document.querySelectorAll('a[data-transition]').forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');
                if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                    e.preventDefault();
                    this.transitionToPage(href);
                }
            });
        });
    }

    async transitionToPage(url) {
        const overlay = document.createElement('div');
        overlay.className = 'page-transition';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: white;
            z-index: 10000;
            opacity: 0;
            transition: opacity 300ms cubic-bezier(0.4, 0, 0.2, 1);
        `;
        document.body.appendChild(overlay);

        // Fade in
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
        });

        await new Promise(resolve => setTimeout(resolve, 300));
        window.location.href = url;
    }
}

// Initialize animation controller
document.addEventListener('DOMContentLoaded', function() {
    const animator = new AnimationController();
    
    // Expose for debugging
    window.animator = animator;

    // Trigger initial animations
    document.querySelectorAll('.animate-fade-in').forEach(el => {
        animator.triggerAnimation(el, 'fade-in', 600);
    });

    document.querySelectorAll('.animate-slide-in').forEach(el => {
        animator.triggerAnimation(el, 'slide-left', 500);
    });
});
