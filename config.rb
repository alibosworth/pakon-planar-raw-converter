require 'slim'
require 'maruku'
# require 'digest/crc32'
# require 'all_your_base'

# activate :compass

activate :directory_indexes
set :relative_links, true

Slim::Engine.set_options :pretty => true

set :css_dir, 'stylesheets'
set :js_dir, 'javascripts'
set :images_dir, 'images'
set :show_exceptions, true if development?

# Slim::Engine.set_options :pretty => false
activate :minify_html do |html|
  html.remove_intertag_spaces = true
end

configure :build do
  # Slim::Engine.set_options :pretty => false
  activate :minify_css
  activate :minify_javascript
  activate :gzip, :exts => %w(.js .css .html .htm .json)
  # ignore /photographs.+.jpg/ ################## Don't copy photographs to build dir # NOTE: only do this when updating images
  # ignore /heap.+.jpg/ ################## Don't copy photographs to build dir # NOTE: only do this when updating images
  # ignore /photographs.+.yml/
end

# activate :deploy do |deploy|
#   deploy.method = :rsync
#   deploy.host   = "ssh.phx.nearlyfreespeech.net"
#   deploy.path   = "/home/public"
#   deploy.user   = "alibosworth_alibosworth"
#   deploy.flags  = "--chmod=g+w -avze --include '.*' --exclude '.git' --exclude '.git/' --exclude '.git/*' --exclude 'photographs/*.*/' --exclude 'heap/*.*/' --exclude 'heap/1000/'  --exclude 'heap/200/'  --exclude 'heap/500/'"
# end

# # NOTE: only do this when updating images
# activate :s3_sync do |s3_sync|
#   s3_sync.bucket = "staging.alibosworth.com"
#   s3_sync.region = "us-east-1"
# end
