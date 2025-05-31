"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Image from "next/image";

const PlaceholderLogo = () => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="36" height="36" rx="8" fill="#6366F1" />
    <text x="50%" y="55%" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="bold" dy=".3em">VF</text>
  </svg>
);

const ThreeDViewer = dynamic(() => import("@/components/ThreeDViewer"), { ssr: false });

type Product = {
  id: string;
  title: string;
  image: string;
  price: string;
};

function useFavorites() {
  const [favorites, setFavorites] = useState<Product[]>([]);
  useEffect(() => {
    const favs = localStorage.getItem("favorites");
    if (favs) setFavorites(JSON.parse(favs));
  }, []);
  const addFavorite = (item: Product) => {
    const updated = [...favorites, item];
    setFavorites(updated);
    localStorage.setItem("favorites", JSON.stringify(updated));
  };
  const removeFavorite = (id: string) => {
    const updated = favorites.filter(f => f.id !== id);
    setFavorites(updated);
    localStorage.setItem("favorites", JSON.stringify(updated));
  };
  const isFavorite = (id: string) => favorites.some(f => f.id === id);
  return { favorites, addFavorite, removeFavorite, isFavorite };
}

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<null | 'success' | 'error'>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Shopify catalog
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Meshy 3D
  const [meshyLoading, setMeshyLoading] = useState(false);
  const [meshyError, setMeshyError] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);

  // Sizing logic state
  const [height, setHeight] = useState(170);
  const [weight, setWeight] = useState(70);
  const [sizingResult, setSizingResult] = useState<string | null>(null);
  const [sizingLoading, setSizingLoading] = useState(false);
  const [sizingError, setSizingError] = useState<string | null>(null);

  // Chatbot UI state
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ sender: "user" | "bot"; message: string }[]>([
    { sender: "bot", message: "Hi! I'm your AI stylist. Ask me anything about fashion, colors, or outfits!" },
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const { favorites, addFavorite, removeFavorite, isFavorite } = useFavorites();

  // Avatar model from Meshy
  const [avatarModelUrl, setAvatarModelUrl] = useState<string | null>(null);

  // Restore avatar from sessionStorage on mount
  useEffect(() => {
    const savedModelUrl = sessionStorage.getItem('avatarModelUrl');
    if (savedModelUrl) {
      setAvatarModelUrl(savedModelUrl);
      setModelUrl(savedModelUrl);
    }
  }, []);

  // Fetch Shopify products
  useEffect(() => {
    setProductsLoading(true);
    fetch("/api/products")
      .then((res) => res.json())
      .then((data) => {
        setProducts(data.products || []);
        setProductsError(null);
      })
      .catch(() => setProductsError("Failed to load products."))
      .finally(() => setProductsLoading(false));
  }, []);

  // After photo upload, generate avatar with Meshy
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setImage(ev.target?.result as string);
        setDialogOpen(true);
      };
      reader.readAsDataURL(file);
      // Upload to API
      uploadToApi(file);
      // Generate avatar with Meshy
      generateAvatarWithMeshy(file);
    }
  };

  const uploadToApi = async (file: File) => {
    setUploadStatus(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        setUploadStatus('success');
      } else {
        setUploadStatus('error');
      }
    } catch {
      setUploadStatus('error');
    }
  };

  const generateAvatarWithMeshy = async (file: File) => {
    setAvatarModelUrl(null);
    setMeshyLoading(true);
    setMeshyError(null);

    try {
      // Convert File to Data URI on the frontend
      const reader = new FileReader();
      const imageDataUri: string = await new Promise((resolve, reject) => {
        reader.onload = (e) => {
          if (e.target?.result) {
            resolve(e.target.result as string);
          } else {
            reject(new Error("Failed to read file as Data URL."));
          }
        };
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
      });

      console.log("Frontend: File converted to Data URI, sending to backend.");

      // Make the API call to your backend with JSON body
      const apiRes = await fetch('/api/meshy-3d', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // Send the Data URI in the JSON body
        body: JSON.stringify({ image_url: imageDataUri }),
      });

      if (!apiRes.ok) {
        const errorData = await apiRes.json();
        throw new Error(`Backend error: ${errorData?.error || apiRes.statusText}`);
      }

      const data = await apiRes.json();
      const modelUrl = data.modelUrl || null;
      if (modelUrl) {
        sessionStorage.setItem('avatarModelUrl', modelUrl);
      }
      setAvatarModelUrl(modelUrl);
      setModelUrl(modelUrl);
      console.log("Frontend: Received model URL:", modelUrl);

    } catch (error) {
      console.error("Frontend: Error generating avatar:", error);
      setMeshyError(`Error generating 3D model: ${error instanceof Error ? error.message : String(error)}`);
      setAvatarModelUrl(null);
      setModelUrl(null);
    } finally {
      setMeshyLoading(false);
    }
  };

  // Meshy 3D generation
  const handleGenerate3D = async () => {
    if (!image) return;
    setMeshyLoading(true);
    setMeshyError(null);
    setModelUrl(null);
    try {
      // Convert base64 image to Blob
      const res = await fetch(image);
      const blob = await res.blob();
      const formData = new FormData();
      formData.append('file', blob, 'photo.png');
      const apiRes = await fetch('/api/meshy-3d', {
        method: 'POST',
        body: formData,
      });
      if (!apiRes.ok) throw new Error('Failed to generate 3D model');
      const data = await apiRes.json();
      setModelUrl(data.modelUrl || null);
    } catch {
      setMeshyError('Failed to generate 3D model.');
    } finally {
      setMeshyLoading(false);
    }
  };

  // Sizing logic (real API)
  const handleSizingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSizingLoading(true);
    setSizingError(null);
    setSizingResult(null);
    try {
      const res = await fetch('/api/sizing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ height, weight }),
      });
      if (!res.ok) throw new Error('Failed to get size');
      const data = await res.json();
      setSizingResult(`Estimated size: ${data.size} (height: ${data.height} cm, weight: ${data.weight} kg)`);
    } catch {
      setSizingError('Failed to estimate size. Please try again.');
    } finally {
      setSizingLoading(false);
    }
  };

  // Function to clear avatar from session
  const clearAvatar = () => {
    sessionStorage.removeItem('avatarModelUrl');
    setAvatarModelUrl(null);
    setModelUrl(null);
  };

  // Chatbot logic (real API) - streaming, avatars, context
  const chatEndRef = useRef<HTMLDivElement>(null);
  const handleSendChat = async () => {
    if (!chatInput.trim()) return;
    setChatHistory((prev) => [...prev, { sender: "user", message: chatInput }]);
    setChatLoading(true);
    setChatError(null);
    const userMessage = chatInput;
    setChatInput("");
    // Send recent context (last 10 messages)
    const context = chatHistory.slice(-10).map(m => ({ role: m.sender, content: m.message }));
    let reply = "";
    setChatHistory((prev) => [...prev, { sender: "bot", message: "" }]);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, context }),
      });
      // Streaming support
      if (res.body && res.ok) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            reply += decoder.decode(value, { stream: !done });
            setChatHistory((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { sender: "bot", message: reply };
              return updated;
            });
          }
        }
      } else {
        // Fallback to non-streaming
        let data = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }
        reply = data?.reply || '[No reply from AI]';
        if (!res.ok) {
          throw new Error(reply);
        }
        setChatHistory((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { sender: "bot", message: reply };
          return updated;
        });
      }
    } catch (err) {
      setChatError('Failed to get reply from AI. Please try again.');
      setChatHistory((prev) => [
        ...prev,
        { sender: "bot", message: '[Error: No reply from AI]' },
      ]);
    } finally {
      setChatLoading(false);
      setTimeout(() => {
        if (chatEndRef.current) {
          chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Navigation Bar */}
      <nav className="w-full flex items-center justify-between py-6 px-8 border-b border-border bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <PlaceholderLogo />
          <span className="text-2xl font-bold tracking-tight">VirtuFit</span>
        </div>
        <div className="flex gap-4">
          <a href="#tryon" className="hover:underline underline-offset-4">Try-On</a>
          <a href="#sizing" className="hover:underline underline-offset-4">Sizing</a>
          <a href="#chatbot" className="hover:underline underline-offset-4">Stylist</a>
          <a href="#branding" className="hover:underline underline-offset-4">Branding</a>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center gap-16 py-12 px-4 sm:px-8">
        {/* Hero Section */}
        <section className="text-center max-w-2xl mt-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold mb-4">AI-Powered Virtual Try-On for Fashion</h1>
          <p className="text-lg text-muted-foreground mb-6">
            Experience the future of online shopping with realistic 3D try-on, precise sizing, and intelligent fashion advice—all in one beautiful, seamless platform.
          </p>
          <Button size="lg" className="rounded-full px-8 py-6 text-base font-semibold">Get Started</Button>
        </section>

        {/* Virtual Try-On Section */}
        <section id="tryon" className="w-full max-w-3xl bg-card rounded-xl shadow p-8 flex flex-col items-center gap-4">
          <h2 className="text-2xl font-bold mb-2">Virtual Try-On</h2>
          <p className="text-muted-foreground mb-4">Upload a photo and see yourself in any outfit with lifelike 3D avatars and real-time garment simulation.</p>
          <div className="flex flex-col items-center gap-4 w-full">
            <Input
              ref={inputRef}
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="max-w-xs"
            />
            {uploadStatus === 'success' && (
              <span className="text-green-600 text-sm">Upload successful!</span>
            )}
            {uploadStatus === 'error' && (
              <span className="text-red-600 text-sm">Upload failed. Please try again.</span>
            )}
            {/* Shopify product catalog */}
            <div className="w-full flex flex-wrap gap-4 justify-center mt-4">
              {productsLoading && <span>Loading products...</span>}
              {productsError && <span className="text-red-600 text-sm">{productsError}</span>}
              <AnimatePresence>
                {products.map((product) => (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card
                      className={`p-2 flex flex-col items-center cursor-pointer border-2 ${selectedProduct?.id === product.id ? 'border-primary' : 'border-transparent'}`}
                      onClick={() => setSelectedProduct(product)}
                      aria-label={`Select ${product.title}`}
                      tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter') setSelectedProduct(product); }}
                    >
                      <Image src={product.image} alt={product.title} width={64} height={64} className="w-16 h-16 object-contain mb-2" />
                      <span className="font-semibold text-sm">{product.title}</span>
                      <span className="text-xs text-muted-foreground">{product.price}</span>
                      <Button
                        variant={isFavorite(product.id) ? "destructive" : "outline"}
                        size="sm"
                        className="mt-2"
                        aria-label={isFavorite(product.id) ? "Remove from favorites" : "Add to favorites"}
                        onClick={e => {
                          e.stopPropagation();
                          if (isFavorite(product.id)) {
                            removeFavorite(product.id);
                          } else {
                            addFavorite(product);
                          }
                        }}
                      >
                        {isFavorite(product.id) ? "♥ Remove" : "♡ Favorite"}
                      </Button>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
            {image && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">Preview Uploaded Photo</Button>
                </DialogTrigger>
                <DialogContent className="flex flex-col items-center gap-4">
                  <DialogTitle>Preview Uploaded Photo</DialogTitle>
                  <DialogDescription>
                    Here you can preview your uploaded photo and see the selected product overlaid. You can also generate a 3D model.
                  </DialogDescription>
                  <motion.div
                    className="relative w-64 h-80 flex items-center justify-center"
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 40 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Image src={image} alt="Preview" className="rounded-lg max-h-80 max-w-full border absolute left-0 top-0 w-full h-full object-contain z-0" width={256} height={256} />
                    {selectedProduct && (
                      <Image src={selectedProduct.image} alt={selectedProduct.title} className="absolute left-0 top-0 w-full h-full object-contain z-10 pointer-events-none" width={64} height={64} />
                    )}
                  </motion.div>
                  {selectedProduct && (
                    <div className="flex flex-col items-center gap-1 mt-2">
                      <span className="font-semibold">{selectedProduct.title}</span>
                      <span className="text-muted-foreground text-sm">{selectedProduct.price}</span>
                      <Button
                        variant={isFavorite(selectedProduct.id) ? "destructive" : "outline"}
                        size="sm"
                        aria-label={isFavorite(selectedProduct.id) ? "Remove from favorites" : "Add to favorites"}
                        onClick={() => isFavorite(selectedProduct.id) ? removeFavorite(selectedProduct.id) : addFavorite(selectedProduct)}
                      >
                        {isFavorite(selectedProduct.id) ? "♥ Remove" : "♡ Favorite"}
                      </Button>
                      <Button variant="secondary" onClick={() => router.push(`/checkout?title=${encodeURIComponent(selectedProduct.title)}&price=${encodeURIComponent(selectedProduct.price)}&image=${encodeURIComponent(selectedProduct.image)}`)}>
                        Buy (Mock)
                      </Button>
                    </div>
                  )}
                  <div className="flex flex-col items-center gap-2 mt-4 w-full">
                    <Button onClick={handleGenerate3D} disabled={meshyLoading} className="w-full">
                      {meshyLoading ? 'Generating 3D Model...' : 'Generate 3D Model (Meshy.ai)'}
                    </Button>
                    {meshyError && <span className="text-red-600 text-sm">{meshyError}</span>}
                    {modelUrl && (
                      <div className="w-full mt-2 flex flex-col items-center gap-2">
                        <a href={modelUrl} target="_blank" rel="noopener noreferrer" className="underline text-blue-600">View 3D Model (external)</a>
                        <ThreeDViewer url={avatarModelUrl || modelUrl} />
                        <span className="text-xs text-muted-foreground">(3D preview powered by Three.js)</span>
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </section>

        {/* Sizing Estimation Section */}
        <section id="sizing" className="w-full max-w-3xl bg-card rounded-xl shadow p-8 flex flex-col items-center gap-4">
          <h2 className="text-2xl font-bold mb-2">Precise Sizing</h2>
          <p className="text-muted-foreground mb-4">AI-powered body measurement and size recommendations for the perfect fit, every time.</p>
          <form className="flex flex-col sm:flex-row gap-4 items-center w-full justify-center" onSubmit={handleSizingSubmit}>
            <Input
              type="number"
              min={100}
              max={250}
              value={height}
              onChange={e => setHeight(Number(e.target.value))}
              className="max-w-[120px]"
              placeholder="Height (cm)"
              required
            />
            <Input
              type="number"
              min={30}
              max={200}
              value={weight}
              onChange={e => setWeight(Number(e.target.value))}
              className="max-w-[120px]"
              placeholder="Weight (kg)"
              required
            />
            <Button type="submit" disabled={sizingLoading}>{sizingLoading ? 'Estimating...' : 'Estimate Size'}</Button>
          </form>
          {sizingError && <span className="text-red-600 text-sm">{sizingError}</span>}
          {sizingResult && (
            <Card className="w-full max-w-md p-4 text-center mt-2">{sizingResult}</Card>
          )}
        </section>

        {/* Fashion Chatbot Section */}
        <section id="chatbot" className="w-full max-w-3xl bg-card rounded-xl shadow p-8 flex flex-col items-center gap-4">
          <h2 className="text-2xl font-bold mb-2">AI Stylist Chatbot</h2>
          <div className="w-full max-w-xl flex flex-col gap-4">
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
              {chatHistory.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: msg.sender === 'user' ? 40 : -40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: msg.sender === 'user' ? 40 : -40 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="flex items-start gap-2">
                    {msg.sender === 'bot' ? (
                      <img src="/bot-avatar.png" alt="Bot" className="w-8 h-8 rounded-full" />
                    ) : (
                      <img src="/user-avatar.png" alt="You" className="w-8 h-8 rounded-full" />
                    )}
                    <Card className={`p-3 ${msg.sender === 'user' ? 'ml-auto bg-primary text-primary-foreground' : 'mr-auto bg-muted'}`}>{msg.message}</Card>
                  </div>
                </motion.div>
              ))}
              {chatLoading && <Card className="p-3 mr-auto bg-muted">Thinking...</Card>}
              {chatError && <span className="text-red-600 text-sm">{chatError}</span>}
            </div>
            <div className="flex gap-2 mt-2">
              <Textarea
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ask your stylist anything..."
                className="resize-none min-h-[40px]"
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendChat();
                  }
                }}
              />
              <Button onClick={handleSendChat} disabled={chatLoading || !chatInput.trim()} className="h-fit">Send</Button>
            </div>
          </div>
          <div ref={chatEndRef}></div>
        </section>

        {/* Branding/Logo Section */}
        <section id="branding" className="w-full max-w-3xl bg-card rounded-xl shadow p-8 flex flex-col items-center gap-4">
          <h2 className="text-2xl font-bold mb-2">Branding & Logo</h2>
          <p className="text-muted-foreground mb-4">VirtuFit: Where virtual meets fashion. (Logo and brand assets coming soon)</p>
          <div className="flex flex-col items-center gap-2">
            <PlaceholderLogo />
            <span className="text-muted-foreground text-sm">[Logo Placeholder]</span>
          </div>
        </section>

        {/* Favorites Section */}
        <section className="w-full max-w-3xl bg-card rounded-xl shadow p-8 flex flex-col items-center gap-4 mt-8" aria-label="Favorites">
          <h2 className="text-2xl font-bold mb-2">Favorites</h2>
          {favorites.length === 0 ? (
            <span className="text-muted-foreground">No favorites yet.</span>
          ) : (
            <div className="flex flex-wrap gap-4 justify-center w-full">
              {favorites.map(fav => (
                <Card key={fav.id} className="p-2 flex flex-col items-center">
                  <Image src={fav.image} alt={fav.title} width={64} height={64} className="w-16 h-16 object-contain mb-2" />
                  <span className="font-semibold text-sm">{fav.title}</span>
                  <span className="text-xs text-muted-foreground">{fav.price}</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="mt-2"
                    aria-label="Remove from favorites"
                    onClick={() => removeFavorite(fav.id)}
                  >
                    ♥ Remove
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="w-full py-6 text-center text-sm text-muted-foreground border-t border-border bg-white/80">
        &copy; {new Date().getFullYear()} VirtuFit. All rights reserved.
      </footer>
    </div>
  );
}
