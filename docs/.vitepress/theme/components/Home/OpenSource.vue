<template>
  <section class="section open-source-section">
    <div class="section-background">
      <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="gradient1-opensource" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stop-color="#ad58ff" stop-opacity="0.4" />
            <stop offset="100%" stop-color="#ff56bd" stop-opacity="0.1" />
          </linearGradient>
        </defs>

        <!-- Background base -->
        <rect width="100%" height="100%" fill="#0c0420" />

        <!-- Gradient wave lines - horizontal orientation -->
        <g opacity="0.4">
          <path d="M100,100 Q600,200 1100,100" stroke="url(#gradient1-opensource)" stroke-width="1" fill="none" />
          <path d="M100,130 Q600,230 1100,130" stroke="url(#gradient1-opensource)" stroke-width="1" fill="none" />
          <path d="M100,160 Q600,260 1100,160" stroke="url(#gradient1-opensource)" stroke-width="1" fill="none" />
          <path d="M100,190 Q600,290 1100,190" stroke="url(#gradient1-opensource)" stroke-width="1" fill="none" />
          <path d="M100,220 Q600,320 1100,220" stroke="url(#gradient1-opensource)" stroke-width="1" fill="none" />
          <path d="M100,250 Q600,350 1100,250" stroke="url(#gradient1-opensource)" stroke-width="1" fill="none" />
          <path d="M100,280 Q600,380 1100,280" stroke="url(#gradient1-opensource)" stroke-width="1" fill="none" />
          <path d="M100,310 Q600,410 1100,310" stroke="url(#gradient1-opensource)" stroke-width="1" fill="none" />
          <path d="M100,340 Q600,440 1100,340" stroke="url(#gradient1-opensource)" stroke-width="1" fill="none" />
          <path d="M100,370 Q600,470 1100,370" stroke="url(#gradient1-opensource)" stroke-width="1" fill="none" />
          <path d="M100,400 Q600,500 1100,400" stroke="url(#gradient1-opensource)" stroke-width="1" fill="none" />
          <path d="M100,430 Q600,530 1100,430" stroke="url(#gradient1-opensource)" stroke-width="1" fill="none" />
          <path d="M100,460 Q600,560 1100,460" stroke="url(#gradient1-opensource)" stroke-width="1" fill="none" />
          <path d="M100,490 Q600,590 1100,490" stroke="url(#gradient1-opensource)" stroke-width="1" fill="none" />
          <path d="M100,520 Q600,620 1100,520" stroke="url(#gradient1-opensource)" stroke-width="1" fill="none" />
        </g>
      </svg>
    </div>

    <div class="section-content opensource-content">
      <div class="opensource-heart">
        <!-- Purple heart icon with glow effect -->
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
            fill="#ad58ff" stroke="#ad58ff" stroke-width="1"></path>
        </svg>
      </div>

      <h2 class="opensource-title">Free & open source</h2>

      <p class="opensource-desc">
        Vercube is MIT Licensed and will always be free and open source.<br>
        This is made possible by our contributors and these companies:
      </p>

      <div class="opensource-links">
        <a href="https://github.com/vercube/vercube" class="minimal-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon
              points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2">
            </polygon>
          </svg>
          <span>Star on GitHub</span>
        </a>

        <a href="https://github.com/sponsors/vercube" class="minimal-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path
              d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z">
            </path>
          </svg>
          <span>Sponsor</span>
        </a>

        <a href="https://x.com/vercubejs" class="minimal-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
            <path fill="currentColor"
              d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584l-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z">
            </path>
          </svg>
          <span>Follow us</span>
        </a>
      </div>
    </div>
  </section>
</template>