package main

import (
	"os"

	"github.com/gal-run/agent-git-graph/internal/agg"
)

func main() {
	workingDirectory, err := os.Getwd()
	if err != nil {
		workingDirectory = "."
	}

	app := agg.NewApp(os.Stdout, os.Stderr, workingDirectory)
	os.Exit(app.Run(os.Args[1:]))
}
