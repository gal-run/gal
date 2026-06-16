package search

import (
	"context"
	"fmt"

	"github.com/gal-run/gal/services/gal-rag/internal/contracts"
)

// GraphMaxNodes is the per-request hard cap (TECH.md 7.1.3).
const GraphMaxNodes = 200

// GraphExpand runs a bounded BFS over chunk symbols/imports. Empty
// edgeKinds means "follow all kinds". A non-positive hops is treated as
// 1. The 200-node cap is enforced before each FindNeighbors call.
func GraphExpand(ctx context.Context, s Searcher, orgID string, req contracts.GraphRequest) (contracts.GraphResponse, error) {
	if len(req.SeedIDs) == 0 {
		return contracts.GraphResponse{Nodes: []contracts.GraphNode{}, Edges: []contracts.GraphEdge{}}, nil
	}
	hops := req.Hops
	if hops <= 0 {
		hops = 1
	}
	if hops > 5 {
		hops = 5
	}
	allowed := make(map[contracts.EdgeKind]bool, len(req.EdgeKinds))
	for _, k := range req.EdgeKinds {
		allowed[k] = true
	}
	follows := func(k contracts.EdgeKind) bool {
		if len(allowed) == 0 {
			return true
		}
		return allowed[k]
	}

	visited := make(map[string]bool, GraphMaxNodes)
	visitedChunks := make(map[string]contracts.Chunk, GraphMaxNodes)
	nodes := make([]contracts.GraphNode, 0, GraphMaxNodes)
	edges := make([]contracts.GraphEdge, 0, GraphMaxNodes)
	frontier := make([]string, 0, len(req.SeedIDs))
	for _, id := range req.SeedIDs {
		if visited[id] {
			continue
		}
		visited[id] = true
		frontier = append(frontier, id)
	}

	seeds, err := s.GetByIDs(ctx, orgID, req.SeedIDs)
	if err != nil {
		return contracts.GraphResponse{}, fmt.Errorf("graph: load seeds: %w", err)
	}
	for i := range seeds {
		c := seeds[i]
		visitedChunks[c.ID] = c
		nodes = append(nodes, contracts.GraphNode{ID: c.ID, Label: labelFor(c), Depth: 0})
		if len(nodes) >= GraphMaxNodes {
			break
		}
	}

	for h := 0; h < hops && len(frontier) > 0 && len(nodes) < GraphMaxNodes; h++ {
		symSet := make(map[string]bool)
		var symbols []string
		for _, id := range frontier {
			c, ok := visitedChunks[id]
			if !ok {
				continue
			}
			for _, s := range c.Chunk.Symbols {
				if !symSet[s] {
					symSet[s] = true
					symbols = append(symbols, s)
				}
			}
			for _, imp := range c.Chunk.Imports {
				if !symSet[imp] {
					symSet[imp] = true
					symbols = append(symbols, imp)
				}
			}
		}
		remaining := GraphMaxNodes - len(nodes)
		if remaining <= 0 {
			break
		}
		neighbors, err := s.FindNeighbors(ctx, orgID, frontier, symbols, remaining)
		if err != nil {
			return contracts.GraphResponse{}, fmt.Errorf("graph: neighbors hop %d: %w", h+1, err)
		}
		next := make([]string, 0, len(neighbors))
		for i := range neighbors {
			n := neighbors[i]
			if visited[n.ID] {
				continue
			}
			visited[n.ID] = true
			visitedChunks[n.ID] = n
			nodes = append(nodes, contracts.GraphNode{ID: n.ID, Label: labelFor(n), Depth: h + 1})
			for _, parent := range frontier {
				if kind := edgeKindBetween(visitedChunks[parent], n, follows); kind != "" {
					edges = append(edges, contracts.GraphEdge{From: parent, To: n.ID, Kind: kind})
				}
			}
			next = append(next, n.ID)
			if len(nodes) >= GraphMaxNodes {
				break
			}
		}
		frontier = next
	}
	if len(nodes) > GraphMaxNodes {
		nodes = nodes[:GraphMaxNodes]
	}
	return contracts.GraphResponse{Nodes: nodes, Edges: edges}, nil
}

func edgeKindBetween(parent, child contracts.Chunk, follows func(contracts.EdgeKind) bool) contracts.EdgeKind {
	parentSyms := make(map[string]bool)
	for _, s := range parent.Chunk.Symbols {
		parentSyms[s] = true
	}
	parentImp := make(map[string]bool)
	for _, i := range parent.Chunk.Imports {
		parentImp[i] = true
	}
	childSyms := make(map[string]bool)
	for _, s := range child.Chunk.Symbols {
		childSyms[s] = true
	}
	if follows(contracts.EdgeImports) {
		for sym := range childSyms {
			if parentImp[sym] {
				return contracts.EdgeImports
			}
		}
	}
	if follows(contracts.EdgeCalls) {
		for sym := range childSyms {
			if parentSyms[sym] {
				return contracts.EdgeCalls
			}
		}
	}
	if follows(contracts.EdgeReferences) {
		for _, h := range child.Chunk.Headings {
			for _, ph := range parent.Chunk.Headings {
				if h != "" && h == ph {
					return contracts.EdgeReferences
				}
			}
		}
	}
	if follows(contracts.EdgeImplements) {
		for sym := range childSyms {
			for psym := range parentSyms {
				if len(sym) > len(psym) && sym[:len(psym)] == psym {
					return contracts.EdgeImplements
				}
			}
		}
	}
	return ""
}

func labelFor(c contracts.Chunk) string {
	if len(c.Chunk.Symbols) > 0 {
		return c.Chunk.Symbols[0]
	}
	if c.SourceRef.Path != "" {
		return c.SourceRef.Path
	}
	return c.ID
}
