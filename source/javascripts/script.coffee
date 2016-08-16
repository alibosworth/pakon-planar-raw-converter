$(document).ready ->
  if $(".container.comparison").length
    $('.comparison-table').featherlightGallery({
      galleryFadeIn: 0,
      galleryFadeOut: 0,
      openSpeed: 0
    })
  # return
