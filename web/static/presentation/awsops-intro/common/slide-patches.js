// Patches for SlideFramework — loaded after slide-framework.js
// This file is NOT overwritten by remarp_to_slides.py build
(function() {
  var origCycle = SlideFramework.prototype.cycleInteractive;
  SlideFramework.prototype.cycleInteractive = function(direction) {
    var slide = this.slides[this.currentSlide];
    if (!slide) return false;

    // Agenda step cycling
    var agenda = slide.querySelector('.agenda-timeline');
    if (agenda) {
      var steps = Array.from(agenda.querySelectorAll('.agenda-step'));
      var activeIdx = -1;
      for (var i = steps.length - 1; i >= 0; i--) {
        if (steps[i].classList.contains('active')) { activeIdx = i; break; }
      }
      if (direction > 0 && activeIdx < steps.length - 1) {
        steps[activeIdx + 1].classList.add('active');
        return true;
      }
      if (direction < 0 && activeIdx > 0) {
        steps[activeIdx].classList.remove('active');
        return true;
      }
      return false;
    }

    // Fall through to original
    return origCycle.call(this, direction);
  };
})();
