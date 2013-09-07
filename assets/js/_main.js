/*! Plugin options and other jQuery stuff */

// FitVids options
$(function($) {
  'use strict';
  
  $("article").fitVids();
  
  setTimeout(function() {
    $('.nav-menuwrapper').addClass('nav-animate-in nav-menuwrapper-active');
  }, 1000);
  
});