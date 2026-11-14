//! A binary min-heap of cell indices keyed by height. Equal keys pop the lower index first, so every machine walks
//! the cells in one order.

#[derive(Debug, Default)]
pub struct CellHeap {
    entries: Vec<(f64, u32)>,
}

impl CellHeap {
    #[must_use]
    pub fn with_capacity(capacity: usize) -> Self {
        Self { entries: Vec::with_capacity(capacity) }
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    fn less(&self, first: usize, second: usize) -> bool {
        let ((first_key, first_cell), (second_key, second_cell)) = (self.entries[first], self.entries[second]);
        first_key < second_key || (first_key.to_bits() == second_key.to_bits() && first_cell < second_cell)
    }

    pub fn push(&mut self, cell: u32, key: f64) {
        self.entries.push((key, cell));
        let mut at = self.entries.len() - 1;
        while at > 0 {
            let parent = (at - 1) / 2;
            if !self.less(at, parent) {
                break;
            }
            self.entries.swap(at, parent);
            at = parent;
        }
    }

    /// The lowest key's cell, or None when the heap is empty.
    pub fn pop(&mut self) -> Option<u32> {
        let last = self.entries.len().checked_sub(1)?;
        self.entries.swap(0, last);
        let (_, cell) = self.entries.pop()?;
        let mut at = 0;
        loop {
            let (left, right) = (2 * at + 1, 2 * at + 2);
            let mut smallest = at;
            if left < self.entries.len() && self.less(left, smallest) {
                smallest = left;
            }
            if right < self.entries.len() && self.less(right, smallest) {
                smallest = right;
            }
            if smallest == at {
                break;
            }
            self.entries.swap(at, smallest);
            at = smallest;
        }
        Some(cell)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pops_lowest_first_and_ties_by_cell() {
        let mut heap = CellHeap::with_capacity(8);
        for (cell, key) in [(5, 2.0), (1, 1.0), (9, 1.0), (3, -4.0), (7, 2.0)] {
            heap.push(cell, key);
        }
        let order: Vec<u32> = std::iter::from_fn(|| heap.pop()).collect();
        assert_eq!(order, [3, 1, 9, 5, 7]);
        assert!(heap.is_empty());
    }
}
