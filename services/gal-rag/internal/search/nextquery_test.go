package search

import (
	"reflect"
	"testing"
)

func TestTokenize(t *testing.T) {
	cases := []struct {
		in     string
		want   []string
		emptyOK bool // true means "len == 0" is acceptable for this case
	}{
		{"the quick brown fox", []string{"quick", "brown", "fox"}, false},
		{"JWT auth, raw token", []string{"jwt", "auth", "raw", "token"}, false},
		{"", nil, true},
		{"a b c", nil, true}, // all stopwords / single-letter
	}
	for _, c := range cases {
		t.Run(c.in, func(t *testing.T) {
			got := tokenize(c.in)
			if c.emptyOK {
				if len(got) != 0 {
					t.Errorf("tokenize(%q) = %v, want empty", c.in, got)
				}
				return
			}
			if !reflect.DeepEqual(got, c.want) {
				t.Errorf("tokenize(%q) = %v, want %v", c.in, got, c.want)
			}
		})
	}
}
