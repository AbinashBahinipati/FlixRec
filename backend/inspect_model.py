import torch

MODEL_PATH = "models/movie_recommendation_model_final.pth"

print("Loading model checkpoint...")

checkpoint = torch.load(
    MODEL_PATH,
    map_location="cpu",
    weights_only=False
)

print("\nCheckpoint type:")
print(type(checkpoint))

print("\nCheckpoint contents:")

if isinstance(checkpoint, dict):
    for key, value in checkpoint.items():
        print(f"{key}: {type(value)}")

        if hasattr(value, "shape"):
            print(f"   shape: {value.shape}")
else:
    print(checkpoint)