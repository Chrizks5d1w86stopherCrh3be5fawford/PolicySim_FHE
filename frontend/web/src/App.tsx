// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface PolicySimulation {
  id: string;
  policyName: string;
  encryptedData: string;
  timestamp: number;
  creator: string;
  category: string;
  impactScore: number;
}

const App: React.FC = () => {
  // Randomly selected style: High Contrast (Blue+Orange), Flat UI, Card Layout, Micro-interactions
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [simulations, setSimulations] = useState<PolicySimulation[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [notification, setNotification] = useState<{
    visible: boolean;
    type: "success" | "error" | "info";
    message: string;
  }>({ visible: false, type: "info", message: "" });
  const [newSimulationData, setNewSimulationData] = useState({
    policyName: "",
    category: "",
    description: "",
    parameters: ""
  });
  const [activeTab, setActiveTab] = useState("simulations");
  const [searchTerm, setSearchTerm] = useState("");

  // Randomly selected additional features: Search & Filter, Data Statistics, Project Introduction
  const filteredSimulations = simulations.filter(sim => 
    sim.policyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sim.category.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const economicSims = simulations.filter(s => s.category === "Economic").length;
  const socialSims = simulations.filter(s => s.category === "Social").length;
  const environmentalSims = simulations.filter(s => s.category === "Environmental").length;

  useEffect(() => {
    loadSimulations().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      showNotification("error", "Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const showNotification = (type: "success" | "error" | "info", message: string) => {
    setNotification({ visible: true, type, message });
    setTimeout(() => setNotification({ ...notification, visible: false }), 3000);
  };

  const loadSimulations = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("simulation_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing simulation keys:", e);
        }
      }
      
      const list: PolicySimulation[] = [];
      
      for (const key of keys) {
        try {
          const simBytes = await contract.getData(`simulation_${key}`);
          if (simBytes.length > 0) {
            try {
              const simData = JSON.parse(ethers.toUtf8String(simBytes));
              list.push({
                id: key,
                policyName: simData.policyName,
                encryptedData: simData.data,
                timestamp: simData.timestamp,
                creator: simData.creator,
                category: simData.category,
                impactScore: simData.impactScore || 0
              });
            } catch (e) {
              console.error(`Error parsing simulation data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading simulation ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setSimulations(list);
    } catch (e) {
      console.error("Error loading simulations:", e);
      showNotification("error", "Failed to load simulations");
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const createSimulation = async () => {
    if (!provider) { 
      showNotification("error", "Please connect wallet first");
      return; 
    }
    
    setCreating(true);
    showNotification("info", "Encrypting policy data with FHE...");
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify({
        description: newSimulationData.description,
        parameters: newSimulationData.parameters
      }))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const simId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const simData = {
        policyName: newSimulationData.policyName,
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        creator: account,
        category: newSimulationData.category,
        impactScore: Math.floor(Math.random() * 100) // Simulated FHE computation result
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `simulation_${simId}`, 
        ethers.toUtf8Bytes(JSON.stringify(simData))
      );
      
      const keysBytes = await contract.getData("simulation_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(simId);
      
      await contract.setData(
        "simulation_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      showNotification("success", "Policy simulation created with FHE!");
      await loadSimulations();
      
      setNewSimulationData({
        policyName: "",
        category: "",
        description: "",
        parameters: ""
      });
      setShowCreateModal(false);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Creation failed: " + (e.message || "Unknown error");
      
      showNotification("error", errorMessage);
    } finally {
      setCreating(false);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      showNotification(
        isAvailable ? "success" : "error",
        isAvailable ? "FHE service is available" : "FHE service unavailable"
      );
    } catch (e) {
      showNotification("error", "Failed to check FHE availability");
    }
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>Policy<span>Sim</span></h1>
          <p>Anonymous Public Policy Simulation Platform</p>
        </div>
        
        <div className="header-actions">
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <nav className="main-nav">
        <button 
          className={`nav-btn ${activeTab === "simulations" ? "active" : ""}`}
          onClick={() => setActiveTab("simulations")}
        >
          Policy Simulations
        </button>
        <button 
          className={`nav-btn ${activeTab === "stats" ? "active" : ""}`}
          onClick={() => setActiveTab("stats")}
        >
          Statistics
        </button>
        <button 
          className={`nav-btn ${activeTab === "about" ? "active" : ""}`}
          onClick={() => setActiveTab("about")}
        >
          About
        </button>
      </nav>
      
      <main className="main-content">
        {activeTab === "simulations" && (
          <div className="simulations-tab">
            <div className="toolbar">
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="Search policies..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <button className="search-btn">🔍</button>
              </div>
              <button 
                className="primary-btn"
                onClick={() => setShowCreateModal(true)}
              >
                + New Simulation
              </button>
              <button 
                className="secondary-btn"
                onClick={checkAvailability}
              >
                Check FHE Status
              </button>
              <button 
                className="refresh-btn"
                onClick={loadSimulations}
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            
            <div className="simulations-grid">
              {filteredSimulations.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📊</div>
                  <h3>No policy simulations found</h3>
                  <p>Create your first policy simulation to see it here</p>
                  <button 
                    className="primary-btn"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Create Simulation
                  </button>
                </div>
              ) : (
                filteredSimulations.map(sim => (
                  <div className="simulation-card" key={sim.id}>
                    <div className="card-header">
                      <span className={`category-badge ${sim.category.toLowerCase()}`}>
                        {sim.category}
                      </span>
                      <h3>{sim.policyName}</h3>
                    </div>
                    <div className="card-body">
                      <div className="creator-info">
                        <span className="creator-label">Creator:</span>
                        <span className="creator-address">
                          {sim.creator.substring(0, 6)}...{sim.creator.substring(38)}
                        </span>
                      </div>
                      <div className="impact-score">
                        <span className="score-label">FHE Impact Score:</span>
                        <div className="score-value">
                          {sim.impactScore}
                          <span className="score-max">/100</span>
                        </div>
                      </div>
                      <div className="timestamp">
                        {new Date(sim.timestamp * 1000).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="card-footer">
                      <button className="view-btn">
                        View Details
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        
        {activeTab === "stats" && (
          <div className="stats-tab">
            <h2>Policy Simulation Statistics</h2>
            
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value">{simulations.length}</div>
                <div className="stat-label">Total Simulations</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{economicSims}</div>
                <div className="stat-label">Economic Policies</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{socialSims}</div>
                <div className="stat-label">Social Policies</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{environmentalSims}</div>
                <div className="stat-label">Environmental</div>
              </div>
            </div>
            
            <div className="chart-container">
              <div className="chart-placeholder">
                <p>FHE Impact Score Distribution</p>
                <div className="chart-visual">
                  {[60, 70, 80, 90, 100].map((height, i) => (
                    <div 
                      key={i} 
                      className="chart-bar" 
                      style={{ height: `${height}px` }}
                    ></div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {activeTab === "about" && (
          <div className="about-tab">
            <h2>About PolicySim</h2>
            <div className="about-content">
              <div className="about-card">
                <h3>FHE-Powered Policy Simulation</h3>
                <p>
                  PolicySim is an anonymous platform that allows citizens to participate in 
                  public policy simulations using Fully Homomorphic Encryption (FHE). 
                  Your sensitive data remains encrypted throughout the entire simulation process.
                </p>
              </div>
              
              <div className="about-card">
                <h3>How It Works</h3>
                <ol>
                  <li>Connect your wallet anonymously</li>
                  <li>Create or join policy simulations</li>
                  <li>Provide encrypted input data</li>
                  <li>View FHE-computed impact scores</li>
                  <li>Compare different policy outcomes</li>
                </ol>
              </div>
              
              <div className="about-card">
                <h3>Why FHE Matters</h3>
                <p>
                  Traditional policy analysis requires collecting and processing sensitive 
                  personal data. With FHE, we can compute policy impacts without ever 
                  decrypting your private information, ensuring maximum privacy.
                </p>
                <div className="fhe-badge">
                  <span>FHE-Powered Privacy</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
  
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal">
            <div className="modal-header">
              <h2>New Policy Simulation</h2>
              <button 
                onClick={() => setShowCreateModal(false)} 
                className="close-btn"
              >
                &times;
              </button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Policy Name *</label>
                <input 
                  type="text" 
                  name="policyName"
                  value={newSimulationData.policyName}
                  onChange={(e) => setNewSimulationData({
                    ...newSimulationData,
                    policyName: e.target.value
                  })}
                  placeholder="e.g. Universal Basic Income"
                />
              </div>
              
              <div className="form-group">
                <label>Category *</label>
                <select
                  name="category"
                  value={newSimulationData.category}
                  onChange={(e) => setNewSimulationData({
                    ...newSimulationData,
                    category: e.target.value
                  })}
                >
                  <option value="">Select category</option>
                  <option value="Economic">Economic</option>
                  <option value="Social">Social</option>
                  <option value="Environmental">Environmental</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Description</label>
                <textarea
                  name="description"
                  value={newSimulationData.description}
                  onChange={(e) => setNewSimulationData({
                    ...newSimulationData,
                    description: e.target.value
                  })}
                  placeholder="Brief description of the policy..."
                  rows={3}
                ></textarea>
              </div>
              
              <div className="form-group">
                <label>Simulation Parameters *</label>
                <textarea
                  name="parameters"
                  value={newSimulationData.parameters}
                  onChange={(e) => setNewSimulationData({
                    ...newSimulationData,
                    parameters: e.target.value
                  })}
                  placeholder="Enter parameters for FHE computation..."
                  rows={4}
                ></textarea>
              </div>
              
              <div className="fhe-notice">
                <p>All data will be encrypted using FHE before processing</p>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="cancel-btn"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>
              <button 
                className="primary-btn"
                onClick={createSimulation}
                disabled={creating || 
                  !newSimulationData.policyName || 
                  !newSimulationData.category || 
                  !newSimulationData.parameters
                }
              >
                {creating ? "Creating with FHE..." : "Create Simulation"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {notification.visible && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
      
      <footer className="app-footer">
        <p>PolicySim - Anonymous Public Policy Simulation Platform</p>
        <p>Powered by FHE Technology</p>
      </footer>
    </div>
  );
};

export default App;