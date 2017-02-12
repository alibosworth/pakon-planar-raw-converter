$.featherlight.autoBind = false
$(document).ready ->
  if $(".container.comparison").length
    $('.comparison-table').featherlightGallery({
      targetAttr: "href",
      filter: "a"
      galleryFadeIn: 0,
      galleryFadeOut: 0,
      openSpeed: 0,
      closeSpeed: 0
    })
  # return
