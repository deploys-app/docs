.PHONY: dev build clean

dev:
	hugo server --disableFastRender --bind 0.0.0.0

build:
	hugo --minify

clean:
	rm -rf public resources
