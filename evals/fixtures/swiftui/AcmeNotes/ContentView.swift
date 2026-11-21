import SwiftUI

struct ContentView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Groceries").font(.title).foregroundStyle(Theme.text)
            Text("Milk, eggs, bread.").foregroundStyle(Theme.text)
            Button("Save") {}
                .padding(.horizontal, 16).padding(.vertical, 8)
                .background(Theme.accent)
                .foregroundStyle(Theme.background)
                .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Theme.background)
    }
}
